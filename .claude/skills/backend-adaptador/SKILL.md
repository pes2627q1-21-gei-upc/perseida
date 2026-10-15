---
name: backend-adaptador
description: Crea un adaptador de la capa infrastructure del backend (repositori SQLModel async, client HTTP extern amb cache Redis, router FastAPI, WebSocket). Usa-la quan calgui connectar un port amb l'exterior o exposar un endpoint.
---

# Backend: adaptador (infrastructure)

Tot el que toca l'exterior viu a `backend/app/infrastructure/<mòdul>/`: repositoris, clients d'APIs externes, routers, WebSockets, Redis, scheduler i exception handlers. Els adaptadors implementen ports del domini.
Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents.

> Les plantilles són orientatives: el repo encara no té codi de backend. Versions de llibreries: versió fixada amb `uv`; pregunta/verifica, no les inventis.

## Quan usar-la / quan NO

- Usa-la: repositori de persistència, client NASA/FCM/Google JWKS/Spotwise/Kev-4B, endpoint REST, WebSocket de xat, cache Redis.
- NO: definir el port (`backend-port`), la lògica de negoci (`backend-entitat-domini`) o el cas d'ús (`backend-service`).
- Els routers criden només services d'application via `Depends`; mai repositoris ni lògica de negoci directament.

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Tipus d'adaptador: repositori, client HTTP extern, router REST, WebSocket, Redis, altre?
2. Quin(s) port(s) implementa? Existeixen? (si no, `backend-port` primer).
3. Repositori: taules i columnes (a partir de l'entitat), claus, relacions, `ON DELETE`; quines consultes crítiques hi haurà (filtres, ordenació, paginació, PostGIS)? Quins índexs i per què? Objectiu de rendiment (p. ex. proximitat ≤ 150 ms)? Migració Alembic necessària?
4. Client extern: quina API, endpoints, autenticació (clau a l'entorn, mai al repo), límits de quota/rate limit, timeouts, reintents, TTL de cache, què retornar si cau (dades en cache vs error)?
5. Router: ruta, mètode, esquema de petició/resposta (contracte OpenAPI, el frontend en genera tipus: no s'inventen camps), codis HTTP, paginació, privat o públic?
6. Autenticació/autorització: sessió JWT pròpia, rols, propietari del recurs; rate limiting? Tot endpoint privat retorna 401/403.
7. WebSocket: autenticació en connectar, sales, pub/sub Redis, missatges i moderació, desconnexions.
8. Patró: Repository, Adapter, Strategy, Facade, Observer... quin i per què; si hi ha dubte, pregunta.
9. Secrets/configuració necessaris: noms de variables d'entorn (sense valors).

## Passos

1. Llegeix el vault (`postgres`, `redis`, `serveis-externs`, `api` si escau) i resol les preguntes amb l'humà.
2. Tria la subsecció (més avall) i segueix-la.
3. Recursos amb cicle de vida (engine, pool Redis, client httpx): crea'ls al `lifespan` i injecta'ls; no els creïs per petició ni com a global mutable.
4. Provider `@lru_cache` + `Annotated[..., Depends(...)]`; en routers/WebSocket la DI és sempre `Depends()`.
5. Errors: l'adaptador tradueix errors tècnics a errors de domini/aplicació documentats al port. Les respostes HTTP (RFC 9457, `code`, 500 sense detalls, `correlation_id`) i els exception handlers es defineixen segons la skill `gestio-errors`; no els dupliquis. Cap `HTTPException` fora d'infrastructure.
6. Escriu els tests d'integració (DESPRÉS del codi).
7. Passa `ruff`, `mypy` strict i `pytest`.

## Subsecció A: repositori SQLModel async

Models de taula **només a infrastructure**, amb **mapper** cap a/des d'entitats del domini (el domini mai veu SQLModel).

- `AsyncSession` amb asyncpg; sessió injectada per `Depends`/UoW.
- Eficiència primer: filtres, agregats, ordenació, paginació **keyset** i PostGIS **dins la query**, no a Python.
- Eager loading explícit (`selectinload`/`joinedload`); relacions amb `lazy="raise"`; **prohibit N+1**.
- Projeccions: selecciona només les columnes necessàries per a consultes de llistat.
- Índexs declarats al model i justificats (comentari/migració): per què, quina consulta serveix. PostGIS: índex espacial (GiST) si la consulta és de proximitat.
- Valida les consultes crítiques amb `EXPLAIN`; objectiu de proximitat ≤ 150 ms (convencions/testing.md).
- Migracions amb Alembic; no `create_all` en producció.
- Tradueix `IntegrityError` a `ConflictError` i absències a `NotFoundError` (els del port).

```python
# infrastructure/event/models.py  (illustrative)
from uuid import UUID
from sqlmodel import Field, SQLModel


class SubscriptionTable(SQLModel, table=True):
    __tablename__ = "event_subscription"
    id: UUID = Field(primary_key=True)
    user_id: UUID = Field(index=True)   # index: list subscriptions by user
    event_id: UUID = Field(index=True)
    status: str


# infrastructure/event/mapper.py
def to_entity(row: SubscriptionTable) -> EventSubscription:
    return EventSubscription(id=row.id, user_id=row.user_id,
                             event_id=row.event_id, status=SubscriptionStatus(row.status))


def to_row(e: EventSubscription) -> SubscriptionTable:
    return SubscriptionTable(id=e.id, user_id=e.user_id,
                             event_id=e.event_id, status=e.status.value)


# infrastructure/event/subscription_repository.py
class SqlSubscriptionRepository:  # implements SubscriptionRepository
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, subscription_id: UUID) -> EventSubscription:
        row = await self._session.get(SubscriptionTable, subscription_id)
        if row is None:
            raise NotFoundError("SUBSCRIPTION_NOT_FOUND", "not found")
        return to_entity(row)
```

## Subsecció B: client HTTP extern

`httpx.AsyncClient` únic (creat al `lifespan`), amb timeouts explícits. Cache **Redis lazy** amb TTL (ADR-0005: Redis només com a cache; res es persisteix només allà): primera petició crida l'extern i desa; les següents serveixen de la cache. **Fallback**: si l'extern cau, retorna les dades en cache en lloc d'un 500 (NFR: sense HTTP 500; recursos des de Redis ≤ 200 ms). Si no hi ha cache, llença l'error documentat al port.

- Respecta límits/quotes de l'API externa; claus a variables d'entorn (mai al repo).
- Tradueix la resposta externa a entitats/value objects del domini (anti-corruption layer); no filtris el format extern.
- Reintents/backoff només si l'humà ho confirma.

```python
# infrastructure/apod/nasa_apod_client.py  (illustrative)
class NasaApodClient:  # implements ApodProvider
    def __init__(self, http: httpx.AsyncClient, cache: Redis, ttl_seconds: int) -> None:
        self._http, self._cache, self._ttl = http, cache, ttl_seconds

    async def get(self, day: date) -> Apod:
        key = f"apod:{day.isoformat()}"
        if cached := await self._cache.get(key):
            return Apod.model_validate_json(cached)
        try:
            resp = await self._http.get("/planetary/apod", params={"date": day.isoformat()})
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceUnavailable("APOD_UNAVAILABLE", "upstream down") from exc
        apod = map_apod(resp.json())
        await self._cache.set(key, apod.model_dump_json(), ex=self._ttl)
        return apod
```

`ExternalServiceUnavailable` és un exemple: confirma amb l'humà/`gestio-errors` quin error s'usa.

## Subsecció C: router FastAPI

- Endpoints prims: validen entrada (Pydantic), criden un service via `Depends`, mapegen a esquema de resposta. Cap lògica de negoci.
- Seguretat al backend: autenticació/autorització, validació d'entrada, rate limiting; 401/403 a tot endpoint privat.
- Contracte = OpenAPI: `response_model`, codis i exemples declarats; el frontend en genera tipus (`openapi-typescript`).
- Errors: via exception handlers (`infrastructure/api/error_handlers.py`), skill `gestio-errors`.

```python
# infrastructure/event/router.py  (illustrative)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

@router.post("", status_code=201, response_model=SubscriptionResponse)
async def subscribe(
    body: SubscribeRequest,
    service: SubscriptionServiceDep,
    user: CurrentUserDep,   # auth dependency; design agreed with the human
) -> SubscriptionResponse:
    return SubscriptionResponse.from_entity(await service.subscribe(user.id, body.event_id))
```

## Subsecció D: WebSocket (xat)

- Autentica en connectar (token de sessió) i autoritza l'accés a la sala; tanca amb el codi adequat si falla.
- Pub/sub amb Redis per repartir missatges entre instàncies; DI amb `Depends()`.
- Cada missatge passa pel service (moderació, persistència) abans de difondre's; gestiona desconnexions i neteja subscripcions.
- Els límits (mida, freqüència) es defineixen amb l'humà.

## Tests

- Integració (≈ 30 % de la piràmide): PostgreSQL/PostGIS i Redis en **contenidors efímers**; `respx` per mockejar HTTP extern; `httpx.AsyncClient` per a l'API; `app.dependency_overrides` quan calgui.
- Repositori: roundtrip entitat→BD→entitat, restriccions úniques, absència, **sense N+1** (compta queries), `EXPLAIN` de les crítiques; test de contracte compartit amb el fake.
- Client extern: èxit, cache hit/miss, extern caigut amb cache (sense 500), extern caigut sense cache, timeout.
- Router: camí feliç, validació, 401/403 sense sessió, format d'error (`gestio-errors`).
- NFR: proximitat ≤ 150 ms i cache ≤ 200 ms (mediana de diverses peticions).
- Cobertura infrastructure ≥ 50 % (codi nou ≥ 70 %). Fixtures a `backend/tests/fixtures/`.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; res assumit en silenci.
- [ ] Adaptador a `infrastructure/<mòdul>/`; implementa un port del domini.
- [ ] Repositori: models de taula + mapper; sense N+1; `lazy="raise"`; eager loading explícit; índexs justificats; `EXPLAIN` fet.
- [ ] Client extern: client del `lifespan`, timeouts, cache Redis lazy amb TTL, fallback sense 500, secrets a l'entorn.
- [ ] Router/WebSocket: `Depends()`, cap lògica de negoci, 401/403, OpenAPI coherent.
- [ ] Cap `HTTPException` fora d'infrastructure; errors segons `gestio-errors`.
- [ ] Migració Alembic si cal.
- [ ] Tests d'integració escrits i verds; `ruff` i `mypy` strict nets.
- [ ] Vault actualitzat si hi ha canvi d'arquitectura o decisió rellevant.
- [ ] Cap secret, `.env` ni dada personal.

## Què NO fer

- Models de taula o DTOs fora d'infrastructure; filtrar-los al domini o a application.
- N+1, lazy loading implícit, filtrar/ordenar/paginar a Python, `SELECT *` en llistats.
- Service Locator, singleton clàssic o estat global mutable; crear clients/pools per petició.
- Retornar 500 per una caiguda d'API externa si hi ha dades en cache; exposar traces o detalls interns al client.
- Lògica de seguretat al client; confiar en el frontend per validar.
- Inventar endpoints, camps de contracte, límits d'APIs externes o versions de llibreries.
- Fer push, merge o PR; treballar fora de `feature/*`.
