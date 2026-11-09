---
titol: "Sessió 2026-11-09: repositori d'esdeveniments (TG-351, tasca #474)"
tipus: sessio
estat: vigent
data: "2026-11-09"
us: ["TG-351", "TG-50"]
font: "Taiga: TG-351 i tasca #474; decisions de Raquel en aquesta sessió (09/11/2026); revisió de reviewer-arquitectura"
etiquetes: [sessio, backend, esdeveniments, persistencia, spotwise]
---

# Sessió 2026-11-09 · Repositori d'esdeveniments (TG-351)

## Objectiu

Fer la tasca 1/6 de TG-351 (#474): un adaptador de repositori que llegeixi els esdeveniments actius en una data i els dels N dies vinents, ordenats per data d'inici.

## Què s'ha fet

- Entitat `AstronomicalEvent` i value object `Location`, amb l'invariant `EVENT_ENDS_BEFORE_START`.
- Port `EventRepository` amb `list_between` i `list_starting_between`.
- Taula `astronomical_events` i migració `create_astronomical_events` amb upgrade i downgrade.
- `SqlEventRepository`, només de lectura.
- Primer el commit `test:` en vermell i després el `feat:` (ADR-0028).

## Decisions preses

Cap ADR nova. Totes les decisions són de Raquel:

- La taula, l'entitat i el repositori els fa TG-351 en lloc de TG-50, segons l'acord amb Manel.
- **Abast:** només lectura. L'upsert és de TG-50.
- **Ubicació:** `latitude` i `longitude` en `double precision`, amb CHECK que obliga a tenir les dues o cap, i un GiST d'expressió. No s'afegeix `geoalchemy2`.
- **Port:** amb intervals genèrics. El càlcul del dia (UTC) i dels N dies va al service de la tasca 2.
- **Paràmetres de la tasca 2:**
  - el dia actiu es calcula en UTC;
  - `upcoming` retorna els esdeveniments que comencen dins de `[ara, ara+N dies)`;
  - `days` accepta de 1 a 30 i per defecte val 7.
- **`source`:** CHECK amb `launch_library_2`, `usno`, `skyfield` i `catalog`, pendent de confirmar amb Manel i l'ADR-0030.
- **Marques de temps:** `created_at` i `updated_at`.
- **`source_url` i textos buits:** es validen a TG-50 i a `EventResponse`, no a l'entitat.

## Canvis al vault

- [[model-de-domini]]: nova secció de l'esdeveniment astronòmic i pendents per a TG-50.
- [[contracte-esdeveniments]]: nota sobre la persistència.

## Pendent / següents passos

- [ ] Confirmar amb Manel els valors de `source` (ADR-0030).
- [ ] Tasca 2/6 (#475): service i routers.
- [ ] Validar a la CI els tests d'integració i la migració. En local no hi ha Postgres.
- [ ] Textos ca/es/en d'`EVENT_ENDS_BEFORE_START`.

## US de Taiga

- TG-351 (tasca #474)
- TG-50
