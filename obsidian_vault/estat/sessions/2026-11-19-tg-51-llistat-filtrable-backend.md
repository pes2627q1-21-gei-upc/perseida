---
titol: "Sessió 2026-11-19: llistat filtrable d'esdeveniments, backend (TG-51, PR 1 de 2)"
tipus: sessio
estat: vigent
data: "2026-11-19"
us: ["TG-51"]
font: "Taiga: TG-51 i tasques #549, #550, #551 i #556; decisions de la persona responsable (12/11/2026)"
etiquetes: [sessio, backend, esdeveniments, postgis, api]
---

# Sessió 2026-11-19 · Llistat filtrable d'esdeveniments, backend (TG-51)

## Objectiu

Deixar a punt la PR 1 de 2 de TG-51: `GET /api/events` filtrable per categoria, dates i proximitat. L'app (pestanya, filtres i `expo-location`) va a la PR 2.

## Què s'ha fet

- **Domini:** value objects `Proximity` i `EventQuery` (`from_filters`): rang de dies UTC amb `to` inclòs, 30 dies per defecte, màxim 90, i proximitat amb `lat` i `lon` obligatoris junts i un radi de 500 km per defecte (1–20.000).
- **Port i servei:** `EventRepository.search(EventQuery)`; `EventService.search` valida els filtres abans de refrescar les fonts (TG-50).
- **Repositori:** `SqlEventRepository.search` en una sola sentència: solapament de dates, categories i `ST_DWithin` sobre `geography` amb l'expressió de l'índex GiST (`LOCATION_GEOGRAPHY`). Els esdeveniments sense ubicació hi surten sempre. Un test d'integració comprova amb `EXPLAIN` que l'índex filtra per distància.
- **Endpoint:** `GET /api/events`, públic, ordenat per `starts_at` i `id`, amb 422 `VALIDATION_ERROR` per als filtres invàlids. OpenAPI i `schema.d.ts` regenerats.
- **Proxy:** `location ^~ /api/events` sense barra final, perquè el llistat comparteixi el límit de 600 per minut (abans nginx hi responia 301), i `instance` `/api/events` al `map` d'`http_top.conf`.
- **Fusió de `develop`:** conflictes a `events/models.py` i `events/ports.py` amb les subscripcions (TG-53), resolts conservant les dues bandes; `_to_entity` s'havia reanomenat `to_entity` a `develop`.
- **Vault:** [[contracte-esdeveniments]], [[api]] i [[nginx-proxy-manager]].

## Pendent

- PR 2: pantalla d'esdeveniments a l'app amb filtres, «A prop meu» amb `expo-location`, estats, ca/es/en i accessibilitat (tasques #552-#555).
- En desplegar la propera release, tornar a enganxar `rate-limit.conf` a l'Advanced del *proxy host* de NPM.
