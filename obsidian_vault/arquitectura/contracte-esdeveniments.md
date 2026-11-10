---
titol: "Contracte de l'esdeveniment"
tipus: arquitectura
estat: vigent
data: "2026-11-09"
us: ["TG-50", "TG-351", "TG-52", "TG-51", "TG-53"]
font: "Taiga: TG-50 i tasca #387 (31/10/2026), TG-351 i TG-52; backend/app/infrastructure/events/schemas.py i backend/tests/fixtures/events/; review de la PR #76 i comentari de TG-50 (02/11/2026)"
etiquetes: [arquitectura, contracte, esdeveniments, api, spotwise]
---

# Contracte de l'esdeveniment

Forma única d'un esdeveniment astronòmic a l'API de Perseida. La fan servir el mapa (TG-52), els endpoints per a Spotwise (TG-351, vegeu [[contracte-spotwise]]), el llistat (TG-51) i les subscripcions (TG-53). Es va publicar a la tasca #387 de TG-50 perquè aquestes US poguessin treballar amb mocks des del primer dia.

- **Codi:** `EventResponse` a `backend/app/infrastructure/events/schemas.py`; categories a `EventCategory` (`backend/app/domain/events/models.py`).
- **Persistència:** taula `astronomical_events` (TG-351, tasca #474); la ubicació es desa en dues columnes `latitude`/`longitude`. Detall a [[model-de-domini#Esdeveniment astronòmic (implementat)]].
- **Exemples (mocks):** `backend/tests/fixtures/events/` (un per categoria, amb i sense ubicació). El test `tests/unit/infrastructure/events/test_event_response_contract.py` comprova que compleixen el contracte.
- **Proves d'integració (TG-351, tasca #478):** `tests/integration/test_events_api.py` desa aquests exemples a PostgreSQL i comprova que `active` i `upcoming` els retornen exactament (camps, `null` explícits, dates en UTC i ordre), i que els paràmetres invàlids responen 422 en problem+json.
- **Endpoints (TG-351, tasca #475):** públics; responen un array JSON directe d'esdeveniments, ordenat per `starts_at`.
  - `GET /api/events/active?date=AAAA-MM-DD`: esdeveniments que se solapen amb el dia UTC indicat (per defecte, avui).
  - `GET /api/events/upcoming?days=N`: esdeveniments que comencen dins de `[ara, ara + N dies)`; `N` de 1 a 30, per defecte 7.
  - Una data que no sigui `AAAA-MM-DD` vàlida o un `days` fora de rang responen 422 `VALIDATION_ERROR` (RFC 9457).
- **OpenAPI (`/api/docs`, tasca #476):** cada endpoint documenta la semàntica, els paràmetres i les respostes 422 i 500 en problem+json. L'exemple de resposta (les fixtures `launch` i `lunar`, a `EVENT_EXAMPLES`) va dins la descripció i no al camp `example`, perquè FastAPI genera l'OpenAPI amb `exclude_none` i hi esborraria els `null`. Un test comprova que és igual a les fixtures.
- **Regenerar l'OpenAPI:** en canviar els endpoints o aquest esquema, es regeneren la còpia `frontend/openapi/openapi.json` (la comprova `tests/unit/infrastructure/test_openapi_copy.py`) i els tipus `frontend/src/shared/api/schema.d.ts`:

```bash
cd backend && uv run python -m scripts.export_openapi && cd ../frontend && pnpm api:generate
```

## Camps

Tots els camps hi són sempre: els opcionals valen `null`, mai s'ometen.

| Camp | Tipus | Regles |
|---|---|---|
| `id` | UUID (`format: uuid` a l'OpenAPI) | UUIDv7 ([[0023-convencions-del-model-de-dades]]); estable, s'hi lliguen subscripcions i sales de xat |
| `title` | text | No buit; en l'idioma de la font |
| `summary` | text | Descripció breu, no buida; en l'idioma de la font |
| `category` | `lunar` \| `solar` \| `meteor_shower` \| `launch` | Valors tancats fixats per TG-50; pendents de notificar a Spotwise |
| `starts_at` | data i hora | ISO 8601 amb zona horària; es retorna en UTC (`Z`) |
| `ends_at` | data i hora | Igual que `starts_at`; mai anterior. Igual a l'inici si l'esdeveniment és instantani (p. ex. lluna plena) |
| `location` | `{latitude, longitude}` o `null` | Latitud −90..90 i longitud −180..180; `null` si és visible des de qualsevol lloc |
| `source_url` | text o `null` | Només `https`; es publica normalitzat, sense blancs als extrems |

Qualsevol altre camp es rebutja.

> [!info] Idioma dels textos
> `title` i `summary` arriben en l'idioma de la font (Launch Library 2 és en anglès) i els esdeveniments calculats per Perseida es generen en anglès. L'app tradueix la `category`. Decisió de Manel (SM), registrada en un comentari de TG-50 a Taiga (02/11/2026).

## Exemple

Dades d'exemple, no reals:

```json
{
  "id": "01a19288-a3f6-7576-a37b-8926ca81b8fe",
  "title": "Falcon 9 Block 5 | Starlink Group 10-12",
  "summary": "A batch of Starlink satellites launched from Cape Canaveral SLC-40.",
  "category": "launch",
  "starts_at": "2026-11-03T21:15:00Z",
  "ends_at": "2026-11-03T23:45:00Z",
  "location": { "latitude": 28.5618, "longitude": -80.577 },
  "source_url": "https://ll.thespacedevs.com/2.3.0/launches/00000000-0000-4000-8000-000000000000/"
}
```

## Regla de canvis

> [!todo] Pendent de notificar a Spotwise
> No hi ha cap acord amb Spotwise sobre els valors de `category`: els fixa TG-50. El README en cita `lunar`, `solar` i `meteor_shower` com a exemples; `launch` és nou. Cal notificar-ho (vegeu [[contracte-spotwise#Regla de canvis]]).

> [!warning] Canvis del contracte
> Un canvi d'aquest esquema canvia el contracte amb Spotwise: s'ha de notificar i justificar (vegeu [[contracte-spotwise#Regla de canvis]]) i s'han d'actualitzar els exemples i aquesta nota a la mateixa PR.

## Enllaços

- [[contracte-spotwise]], [[serveis-externs]], [[model-de-domini]], [[api]]
