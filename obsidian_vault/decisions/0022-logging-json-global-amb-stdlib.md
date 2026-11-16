---
titol: "Logging JSON global amb la llibreria estàndard"
tipus: adr
estat: acceptada
data: "2026-10-16"
us: ["TG-88"]
font: "sessió de treball del 2026-10-15 (TG-88); decisió de la persona responsable; revisió de la PR 27"
etiquetes: [adr, backend, logging, observabilitat]
---

# ADR-0022 · Logging JSON global amb la llibreria estàndard

## Context

El criteri 6 de TG-88 demana que els errors de les tasques programades es registrin «al log estructurat amb el nom de la tasca». L'API no tenia log estructurat (el *logging* complet era fora d'abast de TG-304, vegeu [[0018-errors-rfc-9457-amb-codis-estables]]). Un format únic permet filtrar per tasca o per `correlation_id` en producció.

## Decisió

- Tots els registres de l'API s'emeten com a **JSON, una línia per registre**, des de `app/infrastructure/logging.py` (`configure_logging()`, cridat a `create_app()`).
- Inclou també els loggers d'uvicorn (`uvicorn`, `uvicorn.error`, `uvicorn.access`), perquè el format sigui homogeni.
- Cada registre porta `correlation_id` quan n'hi ha (el del middleware `X-Correlation-ID`) i els camps extres, com `job` per a les tasques del planificador.
- S'implementa amb la **llibreria estàndard** (`logging.Formatter` propi), sense dependències noves.
- **Canvia el format de tots els logs de l'API** (també en local).

## Conseqüències

### Positives

- Un sol format, llegible per màquines, amb correlació per petició i per tasca.
- Cap dependència nova que fixar i mantenir ([[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]).

### Negatives (assumides)

- Els logs en local són menys llegibles per a una persona.
- El formatador és codi propi a mantenir; si calen més camps o nivells de configuració, caldrà reavaluar una llibreria.

## Alternatives descartades

- `structlog` o `python-json-logger`: afegeixen una dependència per a un cas que la llibreria estàndard cobreix.
- JSON només per al planificador: dos formats a la mateixa sortida i sense `correlation_id` homogeni.

## US de Taiga relacionades

- TG-88 (planificador APScheduler)

## Enllaços

- [[backend-hexagonal]]
- [[api]]
- [[0003-un-sol-proces-fastapi]]
