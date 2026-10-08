---
titol: "Injecció de dependències amb Depends i services singleton pythònics"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable"
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

## Conseqüències

### Positives

- Un únic patró, fàcil de generar, revisar i substituir als tests.
- Sense estat compartit mutable ni magia de classe.

### Negatives (assumides)

- Els services han de ser sense estat; l'estat va a la base de dades, a Redis o als recursos de `lifespan`.

## Alternatives descartades

- Service Locator o contenidor global: oculta dependències i dificulta els tests.
- Singleton clàssic: poc pythònic i difícil de substituir.
- Crear el service a cada petició: cost innecessari.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[backend-hexagonal]]
- [[0016-ports-i-entitats-riques-al-domini]]
- [[0003-un-sol-proces-fastapi]]
