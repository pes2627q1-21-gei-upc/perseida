---
titol: "Injecció de dependències amb Depends i services singleton pythònics"
tipus: adr
estat: acceptada
data: "2026-11-18"
us: ["TG-205", "TG-46", "TG-49"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable; actualització de TG-46 (2026-10-22); review de la PR #104 (TG-49, 18/11/2026)"
etiquetes: [adr, backend, fastapi, di, patrons]
---

# ADR-0017 · Injecció de dependències amb Depends i services singleton pythònics

## Context

Els casos d'ús de `application` són serveis sense estat que no cal instanciar a cada petició. Cal una forma única, idiomàtica de FastAPI, perquè els agents generin la mateixa estructura i es puguin substituir en els tests.

## Decisió

- Tot cas d'ús és un **service singleton** a `application` (sense importar FastAPI), creat per un provider `@lru_cache` i injectat amb `Annotated[X, Depends(get_x)]`. Els providers viuen a `infrastructure/<mòdul>/dependencies.py` (*composition root*), que és qui coneix els adaptadors concrets. No s'usa el singleton clàssic (`__new__`, metaclasses) ni estat global mutable.
- Els recursos amb cicle de vida (engine, pool de Redis, client `httpx`) es creen i es tanquen a `lifespan`.
- La injecció es fa **sempre amb `Depends()`** a routers i WebSockets; als tests es substitueix amb `app.dependency_overrides`.
- **No s'usa Service Locator.** Els contextos sense petició (jobs d'APScheduler, scripts) construeixen els services amb els mateixos providers.

> [!info] Actualització 2026-10-22 (TG-46): adaptadors per petició sobre recursos de `lifespan`
> Un service o adaptador que depèn d'un recurs creat al `lifespan` (client `httpx`, `session_factory`, Redis) no pot ser un singleton de `@lru_cache`, perquè el provider no té accés a l'`app`. En aquest cas:
> - el provider rep `HTTPConnection` (serveix per a HTTP i WebSocket) i construeix l'adaptador i el service **a cada petició** amb els recursos d'`app.state`;
> - l'adaptador i el service són objectes lleugers, sense estat propi; el cost és crear-los, no els recursos, que es comparteixen;
> - als tests es continua substituint amb `app.dependency_overrides`.
>
> Primer cas: `get_apod_provider` i `get_apod_service` (`app/infrastructure/apod/dependencies.py`). La resta de la decisió no canvia.

> [!info] Actualització 2026-11-18 (TG-49): services construïts un sol cop al `lifespan`
> Variant de l'anterior per a un service que depèn de recursos del `lifespan` i que ha de viure tant com el procés (perquè guarda estat tècnic entre peticions o perquè és car de construir):
> - es construeix **un sol cop** al `lifespan` (`build_<nom>_service(...)`) i es desa a `app.state`;
> - el provider rep `HTTPConnection` i el llegeix d'`app.state`, sense construir res;
> - als tests es continua substituint amb `app.dependency_overrides`.
>
> Si el service pot ser lleuger i sense estat, es fa servir la variant per petició. Casos: `auth_service` (`app/infrastructure/auth/dependencies.py`) i `health_service` (`app/infrastructure/health/dependencies.py`).
>
> **Excepció acceptada a «sense estat»:** `HealthService` guarda en un conjunt (`_abandoned`) les comprovacions que ha abandonat per temps esgotat, fins que acaben de cancel·lar-se. asyncio només en guarda referències febles: sense aquest conjunt, una comprovació a mig cancel·lar es podria destruir («Task was destroyed but it is pending»). És estat tècnic del procés, no de negoci: cap resposta en depèn i no s'ha de compartir entre instàncies. Una variable global del mòdul no és alternativa, perquè seria estat global mutable.

## Conseqüències

### Positives

- Un únic patró, fàcil de generar, revisar i substituir als tests.
- Sense estat compartit mutable ni magia de classe.

### Negatives (assumides)

- Els services han de ser sense estat; l'estat va a la base de dades, a Redis o als recursos de `lifespan`. L'única excepció és l'estat tècnic de `HealthService` (vegeu l'actualització de TG-49).

## Alternatives descartades

- Service Locator o contenidor global: oculta dependències i dificulta els tests.
- Singleton clàssic: poc pythònic i difícil de substituir.
- Crear el service a cada petició: cost innecessari.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)
- TG-46 (actualització: adaptadors per petició sobre recursos de `lifespan`)
- TG-49 (actualització: services construïts un sol cop al `lifespan` i estat tècnic de `HealthService`)

## Enllaços

- [[backend-hexagonal]]
- [[0016-ports-i-entitats-riques-al-domini]]
- [[0003-un-sol-proces-fastapi]]
