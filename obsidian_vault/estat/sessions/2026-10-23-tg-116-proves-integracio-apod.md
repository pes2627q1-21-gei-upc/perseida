---
titol: "Sessió 2026-10-23: proves d'integració de GET /api/apod (TG-116)"
tipus: sessio
estat: vigent
data: "2026-10-23"
us: ["TG-47", "TG-116"]
font: "Tasca TG-116 i US TG-47 de Taiga; backend/app/main.py, backend/app/infrastructure/apod/"
etiquetes: [sessio, backend, apod, testing, tg-47, tg-116]
---

# Sessió 2026-10-23 · Proves d'integració de `GET /api/apod`

## Objectiu

Tancar TG-116: verificar `GET /api/apod` sobre l'app completa ara que TG-46 ha portat l'adaptador real (`NasaApodProvider`).

## Què s'ha fet

- `backend/tests/integration/test_apod_api.py`: `create_app()` amb el lifespan, `CorrelationIdMiddleware` i els handlers reals, `NasaApodProvider` sobre PostgreSQL i Redis, i la NASA simulada amb `respx`.
- Un test per criteri de TG-47, amb el nom `test_tg47_cN_...` ([[testing]], traçabilitat criteri-prova):
  - c2: sense data es demana a la NASA l'APOD més recent;
  - c3: amb una data passada se'n demana aquella data;
  - c4: camps `date`, `title`, `explanation`, `media_type`, `url` i `copyright` (amb valor i `null`);
  - c5: la clau va a la NASA per la capçalera `X-Api-Key` i no surt ni a la resposta ni al `detail` del 503;
  - c6: 422 (`VALIDATION_ERROR`, `APOD_DATE_IN_FUTURE`, `APOD_DATE_BEFORE_START`) sense cridar la NASA, 503 `APOD_UNAVAILABLE` sense dades guardades i 200 amb les dades de PostgreSQL si la NASA cau.
- Cada test buida la taula `apod` i les claus `cache:apod:*` abans i després.

## Decisions preses

- Els tests usen PostgreSQL i Redis reals, com `test_apod_cache_performance.py`. Sense `POSTGRES_HOST` i `REDIS_HOST` se salten; es verifiquen a la CI, que els aixeca com a *service containers* (decisió de la persona; en local no hi ha Docker).

## Canvis al vault

- Aquesta nota.

## Pendent / següents passos

- [ ] Push i PR cap a `develop` (la persona); comprovar que el job `backend` de la CI executa i passa els tests nous.
- [ ] Tancar TG-116 a Taiga i moure TG-47 quan la PR estigui fusionada.

## US de Taiga

- TG-47
- TG-116
