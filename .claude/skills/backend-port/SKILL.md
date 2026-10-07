---
name: backend-port
description: Defineix un port (interfície Protocol/ABC) a la capa domain del backend per a repositoris, clients externs, cache o serveis. Usa-la quan un cas d'ús necessiti una dependència externa abstreta.
---

# Backend: port

Un port és una interfície (`typing.Protocol` o ABC) a `backend/app/domain/<mòdul>/` que descriu què necessita el negoci de l'exterior (driven port). La implementa un adaptador d'infrastructure.
Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents.

> Les plantilles són orientatives: el repo encara no té codi de backend. Versions de llibreries: versió fixada amb `uv`; pregunta/verifica.
> Nota: `backend-hexagonal.md` del vault diu «use cases and ports» a application; la decisió de producte (2026-10-07) els situa al domini. Segueix el domini i, si en dubtes, pregunta a l'humà.

## Quan usar-la / quan NO

- Usa-la: nou repositori, client d'API externa, cache, enviador de notificacions, moderador, rellotge/generador d'ids.
- NO: implementació (`backend-adaptador`); orquestració (`backend-service`); entitats (`backend-entitat-domini`).
- El port només importa tipus del domini i la biblioteca estàndard. Res de FastAPI, SQLModel, Redis, httpx.

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Quina és la responsabilitat única del port (una sola raó per canviar)? Nom en termes de negoci, no de tecnologia.
2. Quins mètodes necessita el cas d'ús (i només aquests)? Si són molts, cal dividir-lo (ISP)?
3. Tipus d'entrada i sortida de cada mètode: entitats/value objects del domini, mai models de taula ni DTOs HTTP.
4. Quins errors pot llençar i quan (`NotFoundError`, `ConflictError`, error d'extern no disponible)? Retorna `None`/`Optional` o llença?
5. És async? (I/O → sí, per defecte; confirma.)
6. Patró: Repository (persistència d'agregat), Specification (filtres componibles), Strategy (diverses implementacions intercanviables), Adapter/Facade (extern)? Justifica'l.
7. Consultes: filtres, ordenació, paginació (keyset) i projeccions necessàries? Qui defineix el criteri (Specification o paràmetres)?
8. Hi ha una variant de fallback/cache esperada (p. ex. APOD)? Això és responsabilitat de l'adaptador, no del contracte.

## Passos

1. Llegeix el vault; resol les preguntes amb l'humà.
2. Tria Protocol (estructural, sense herència, preferit per defecte) o ABC (si cal comportament compartit o registre explícit); confirma amb l'humà si hi ha dubte.
3. Escriu la interfície amb signatures completes i tipades, docstring del contracte: què fa, precondicions, què retorna i **quins errors llença**.
4. Un repositori d'agregat: un per arrel d'agregat; mètodes `get`, `add`, `save`, consultes específiques (no un CRUD genèric buit).
5. Escriu un **fake en memòria** per als tests dels services (a `backend/tests/`).
6. Documenta el contracte perquè l'adaptador el pugui verificar amb un test de contracte compartit.
7. Errors: els del domini (`domain/shared/errors.py`); format HTTP i codis a la skill `gestio-errors`, no el dupliquis.
8. Passa `ruff`, `mypy` strict i `pytest`.

## Plantilla de codi (orientativa)

```python
# domain/event/ports.py
from typing import Protocol
from uuid import UUID

from app.domain.event.entities import EventSubscription


class SubscriptionRepository(Protocol):
    async def get(self, subscription_id: UUID) -> EventSubscription:
        """Return the subscription.

        Raises:
            NotFoundError: code SUBSCRIPTION_NOT_FOUND if it does not exist.
        """
        ...

    async def add(self, subscription: EventSubscription) -> None:
        """Persist a new subscription.

        Raises:
            ConflictError: if the user is already subscribed to the event.
        """
        ...

    async def save(self, subscription: EventSubscription) -> None: ...
```

```python
# tests/fakes/subscription_repository.py
class InMemorySubscriptionRepository:
    def __init__(self) -> None:
        self._items: dict[UUID, EventSubscription] = {}

    async def get(self, subscription_id: UUID) -> EventSubscription:
        try:
            return self._items[subscription_id]
        except KeyError:
            raise NotFoundError("SUBSCRIPTION_NOT_FOUND", "not found") from None
```

Notes: noms i codis són il·lustratius, no una decisió.

## Tests

- El port no té lògica: no es testeja directament. Es verifica amb:
  - el **fake** en memòria usat als tests dels services (application ≥ 70 %);
  - un **test de contracte** reutilitzable que executen tant el fake com l'adaptador real (integració), comprovant retorns i errors documentats.
- mypy strict ha de validar que fake i adaptador compleixen el Protocol.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; res assumit en silenci.
- [ ] Port a `domain/<mòdul>/`, sense dependències de frameworks ni I/O.
- [ ] Una responsabilitat; només els mètodes que el negoci necessita.
- [ ] Tipus d'entrada/sortida del domini; async coherent.
- [ ] Errors documentats al docstring.
- [ ] Patró triat justificat.
- [ ] Fake en memòria creat; test de contracte previst.
- [ ] `ruff` i `mypy` strict nets.
- [ ] Vault actualitzat si el port reflecteix una decisió d'arquitectura rellevant.

## Què NO fer

- Filtrar la tecnologia al contracte (sessions SQL, `Response` HTTP, claus Redis).
- Retornar models de taula o DTOs; retornar `dict` sense tipus.
- Ports «déu» amb tots els mètodes possibles; repositoris genèrics sense semàntica de negoci.
- Posar fallback/cache al contracte: és detall de l'adaptador.
- Inventar mètodes o errors no demanats pel cas d'ús.
- Fer push, merge o PR; treballar fora de `feature/*`.
