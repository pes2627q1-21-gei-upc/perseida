---
titol: "Sessió 2026-11-17: backend de les sortides d'observació (TG-629, tasques #637 a #639)"
tipus: sessio
estat: vigent
data: "2026-11-17"
us: ["TG-629"]
font: "Taiga: TG-629 i tasques #637-#642; decisions de Raquel en aquesta sessió (17/11/2026); revisió de reviewer-arquitectura; proves locals amb PostgreSQL/PostGIS 18 i Redis 8 a Docker"
etiquetes: [sessio, backend, sortides]
---

# Sessió 2026-11-17 · Backend de les sortides d'observació (TG-629)

## Objectiu

Implementar la part de backend de TG-629: entitat `Outing`, `OutingService` i `/api/outings` (tasques #637, #638 i #639). El frontend (#640 i #641) va en una altra PR.

## Què s'ha fet

- **Domini (#637):** `Outing` amb les regles de dates, ubicació i textos, i `OutingChanges` per al PATCH. Ports `OutingRepository` i `EventLookup`. `Location` passa a `app/domain/shared/location.py` (els esdeveniments el reexporten).
- **Application (#638):** `OutingService`. Qualsevol sessió llegeix; només l'autora edita o esborra.
- **Infrastructure (#639):** taula `outings` i migració `create_outings`, `SqlOutingRepository` amb un join a `users`, router `/api/outings` i descripcions a l'OpenAPI. Detall a [[model-de-domini#Sortida d'observació (implementat)]] i [[api#Sortides d'observació (TG-629)]].
- **Fora de la US:** el `405` ara posa a `Allow` tots els mètodes que l'OpenAPI documenta per al camí. `/api/outings` és el primer recurs amb dos mètodes al mateix camí, i Starlette només hi posava el de la primera ruta.
- **Tests d'altres funcionalitats:** els d'esdeveniments buiden `outings` amb `astronomical_events`, perquè la FK no deixa fer el `TRUNCATE` sol. El contracte schemathesis accepta el 403, el 404 i el 422 de negoci d'un cos vàlid, com ja feia amb l'APOD i el quiz.
- **Catàleg d'errors:** els codis `OUTING_*` amb els textos ca/es/en aprovats per Raquel.
- **Verificació local:**
  - 1.370 tests en verd.
  - Cobertura: 99 % en total i 100 % del codi nou (`diff-cover`).
  - Mutation score del domini: 85,19 %.
  - ruff, format, mypy i import-linter (6 contractes) en verd.

## Decisions

Cap ADR nova. Decisions de Raquel:

- «Les meves sortides» amb `GET /api/outings?mine=true`.
- L'autora a la resposta és `id`, `display_name` i `avatar_url`, mai el correu.
- Un `event_id` que no existeix és un 422 `OUTING_EVENT_NOT_FOUND`.
- En un PATCH, la regla de l'inici futur només s'aplica si canvien les dates.
- Amb la revisió d'arquitectura:
  - S'aplica la regla de [[backend-hexagonal]]: les sortides no importen la funcionalitat d'esdeveniments, i ho vigila un contracte d'import-linter.
  - La longitud dels textos només la mira el domini, un cop netejats.
  - La paginació queda fora de la US: és la tasca #644.
- Review de la PR #101 (AlexGa03): [[backend-hexagonal]] actualitzat amb el contracte d'`outings` i `Location` a `shared`; la paginació keyset per `(starts_at, id)` es farà a #644.

## Pendent / següents passos

- [ ] PR del backend cap a `develop` quan Raquel ho demani.
- [ ] Frontend (#640 i #641): formulari amb react-hook-form, zod, expo-location i datetimepicker (dependències aprovades), llistes, detall i esborrat.
- [ ] Paginació keyset de `GET /api/outings` (#644, Sprint 3).
- [ ] Al domini, `OutingChanges` no rebutja un `null` enviat a un camp que no l'admet; ara ho fa l'esquema HTTP. Si es vol també al domini, cal un codi nou amb textos aprovats.
- [ ] Possibles conflictes de migració amb altres branques que també creïn una migració sobre `c4d8e1a7b952`.

## US de Taiga

- TG-629 (tasques #637, #638, #639; #640-#642 pendents)
- #644 (paginació, Sprint 3)
