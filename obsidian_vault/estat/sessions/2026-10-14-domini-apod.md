---
titol: "Sessió 2026-10-14: domini i application de l'APOD"
tipus: sessio
estat: vigent
data: 2026-10-14
us: ["TG-47"]
font: "treball de la tasca TG-113 de la US TG-47 (branca feature/TG-113-domini-apod); acord amb TG-46 a la descripció de TG-47 a Taiga"
etiquetes: [sessio, backend, tg-47]
---

# Sessió 2026-10-14 · Domini i application de l'APOD

## Objectiu

Deixar el domini i l'application de l'APOD (tasca TG-113 de la US TG-47) sense esperar l'adaptador real de TG-46, seguint [[0016-ports-i-entitats-riques-al-domini]] i [[0017-injeccio-de-dependencies-i-services-singleton]].

## Què s'ha fet

- Entitat `Apod` (immutable) i `MediaType` (`image` | `video`), amb `copyright` opcional.
- Port `ApodProvider` al domini: `get_today()` i `get_by_date(date)`.
- Regla de dates `ensure_requestable`: rebutja dates futures (`APOD_DATE_IN_FUTURE`) i anteriors al 16/06/1995 (`APOD_DATE_BEFORE_START`), com a `ValidationError` (422).
- `ApodService.get_apod(day=None)` a application; el rellotge és injectable.
- `FakeApodProvider`, factoria `make_apod` i 19 tests nous. Els tests s'han escrit després del codi ([[0019-tests-despres-del-codi]]).

## Decisions preses

- Repartiment amb TG-46: l'adaptador real (NASA, Redis i PostgreSQL) és de TG-46; TG-47 va contra el port amb un fake i, quan TG-46 estigui, només es canvia el fake per l'adaptador.
- Camps de la resposta de l'API: `date` i `url`; a l'entitat són `apod_date` i `media_url` i la DTO els mapeja (criteri 4 de TG-47).
- Els errors de paràmetre de data són 422 (segons [[0018-errors-rfc-9457-amb-codis-estables]]) i, si la NASA falla sense cache, 503 (`ExternalServiceError`); no 400 ni 502.
- «Avui» és la data UTC. La NASA publica segons l'hora de la costa est dels EUA: durant unes hores, una data «d'avui» podria passar la validació sense existir encara.

## Canvis al vault

- [[model-de-domini]]: `APOD` amb `mediaType` i `copyright`.
- [[estat-actual]]: TG-47 a In progress.

## Pendent / següents passos

- [x] Textos ca/es/en i fila al catàleg per a `APOD_DATE_IN_FUTURE` i `APOD_DATE_BEFORE_START`.
- [ ] TG-114 (router i DTOs), TG-115 (gestió d'errors) i TG-116 (proves d'integració).
- [ ] Provider amb `lru_cache`/`Depends` ([[0017-injeccio-de-dependencies-i-services-singleton]]): s'afegeix a TG-114.
- [ ] Test de contracte compartit per a l'adaptador real de TG-46.
- [ ] Obrir la PR cap a `develop` (la persona).

## US de Taiga

- TG-47