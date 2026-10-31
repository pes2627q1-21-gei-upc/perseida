---
titol: "Contracte de l'esdeveniment"
tipus: arquitectura
estat: vigent
data: "2026-10-31"
us: ["TG-50", "TG-351", "TG-52"]
font: "Taiga: TG-50 i tasca #387 (31/10/2026), TG-351 i TG-52; backend/app/infrastructure/events/schemas.py i backend/tests/fixtures/events/"
etiquetes: [arquitectura, contracte, esdeveniments, api, spotwise]
---

# Contracte de l'esdeveniment

Forma única d'un esdeveniment astronòmic a l'API de Perseida. La fan servir el mapa (TG-52), els endpoints per a Spotwise (TG-351, vegeu [[contracte-spotwise]]), el llistat (TG-51) i les subscripcions (TG-53). Es va publicar a la tasca #387 de TG-50 perquè aquestes US poguessin treballar amb mocks des del primer dia.

- **Codi:** `EventResponse` a `backend/app/infrastructure/events/schemas.py`; categories a `EventCategory` (`backend/app/domain/events/models.py`).
- **Exemples (mocks):** `backend/tests/fixtures/events/` (un per categoria, amb i sense ubicació). El test `tests/unit/infrastructure/events/test_event_response_contract.py` comprova que compleixen el contracte.
- **Endpoints:** `GET /api/events/active` i `GET /api/events/upcoming` els declara TG-351 amb aquest esquema; després es regenera `frontend/src/shared/api/schema.d.ts` (`pnpm api:generate`).

## Camps

Tots els camps hi són sempre: els opcionals valen `null`, mai s'ometen.

| Camp | Tipus | Regles |
|---|---|---|
| `id` | UUID | UUIDv7 ([[0023-convencions-del-model-de-dades]]); estable, s'hi lliguen subscripcions i sales de xat |
| `title` | text | No buit; en l'idioma de la font |
| `summary` | text | Descripció breu, no buida; en l'idioma de la font |
| `category` | `lunar` \| `solar` \| `meteor_shower` \| `launch` | Valors tancats acordats amb Spotwise |
| `starts_at` | data i hora | ISO 8601 amb zona horària; es retorna en UTC (`Z`) |
| `ends_at` | data i hora | Igual que `starts_at`; mai anterior. Igual a l'inici si l'esdeveniment és instantani (p. ex. lluna plena) |
| `location` | `{latitude, longitude}` o `null` | Latitud −90..90 i longitud −180..180; `null` si és visible des de qualsevol lloc |
| `source_url` | text o `null` | Només `https` |

Qualsevol altre camp es rebutja.

> [!info] Idioma dels textos
> `title` i `summary` arriben en l'idioma de la font (Launch Library 2 és en anglès) i els esdeveniments calculats per Perseida es generen en anglès. L'app tradueix la `category`. Decisió de Manel (SM) a l'especificació de TG-50, 31/10/2026.

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

> [!warning] Canvis del contracte
> Un canvi d'aquest esquema canvia el contracte amb Spotwise: s'ha de notificar i justificar (vegeu [[contracte-spotwise#Regla de canvis]]) i s'han d'actualitzar els exemples i aquesta nota a la mateixa PR.

## Enllaços

- [[contracte-spotwise]], [[serveis-externs]], [[model-de-domini]], [[api]]
