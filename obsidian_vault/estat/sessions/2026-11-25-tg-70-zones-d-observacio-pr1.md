---
titol: "Sessió 2026-11-25: zones d'observació a PostGIS i consulta per proximitat, PR 1 (TG-70)"
tipus: sessio
estat: vigent
data: "2026-11-25"
us: ["TG-70", "TG-71"]
font: "Taiga TG-70 (subtasques #495 a #500 i #660, comentari del pla del 25/11/2026); codi a backend/app/domain/observation_zones i backend/app/infrastructure/observation_zones"
etiquetes: [sessio, backend, postgis, zones]
---

# Sessió 2026-11-25 · Zones d'observació (TG-70, PR 1 de 2)

## Objectiu

Portar la PR 1 de TG-70: entitat, port, taula amb índex GiST, migració reversible, repositori amb consulta per radi i proves d'integració amb PostGIS real.

## Què s'ha fet

- **Pla a Taiga:** comentari a TG-70 amb les dues PR apilades. PR 1 (`feature/TG-70-zones-postgis`): tasques 1/6, 2/6, 4/6 i 5/6. PR 2 (`feature/TG-70-zones-seed`, sobre la PR 1): tasques 3/6 i 3b/6.
- **Domini** (`app/domain/observation_zones`): `ObservationZone`, `ZoneProximity`, `ZoneDistance`, port `ObservationZoneRepository` i els tres codis `OBSERVATION_ZONE_*_INVALID`. Tests en vermell (`b2f78c4d`) abans del codi (`ef3f8849`) (ADR-0028).
- **Infraestructura:** taula `observation_zones` (`5b8d2f6e9a14`), índex GiST sobre la mateixa expressió que `astronomical_events` (`LOCATION_GEOGRAPHY`, TG-50) i `SqlObservationZoneRepository`. Tests d'integració en vermell (`204744d5`) abans del codi (`839e42a6`); un comprova amb `EXPLAIN` que la cerca és un `Index Cond` de l'índex.
- **Verificació local:** ruff, mypy, lint-imports i suite completa (2608 passats); cobertura del 100 % als fitxers nous i 99 % global. mutmut no s'executa a Windows natiu: queda per a la CI.
- **Revisió de `reviewer-arquitectura`:** cap troballa crítica ni alta. Aplicades: el nom rebutja NUL (test `7ebe222b` abans de `55001794`), contracte d'import-linter de `observation_zones` (`8e6be31c`), fora un test tautològic.
- **Errors de testing:** [[2026-11-25-tg-70-nom-de-zona-amb-nul]] (`review`). Un `roig-inesperat` alié a TG-70 (tests de Spotwise amb el `.env` local) es porta a part, a TG-662.

## Decisions preses

Cap ADR nova.

- **Sense radi màxim** (decisió de Raquel, 25/11/2026): només es rebutja un radi ≤ 0, `NaN` o infinit (l'infinit, decisió de Raquel després de la revisió; test abans del `fix:` `4cfc6411`).
- **`LOCATION_GEOGRAPHY` es queda a `infrastructure/events/tables.py`** i zones l'importa (decisió de Raquel, 25/11/2026): no viola cap regla i evita un refactor fora de la US.
- **Font de la càrrega inicial:** llista curada a mà de zones de Catalunya, amb l'URL de la font de cada zona (decisió de Raquel, 25/11/2026). Va a la PR 2.
- **Dues PR apilades** (decisió de Raquel, 25/11/2026).
- **Sense endpoint:** cap criteri en demana; el consumirà TG-71.

## Canvis al vault

- [[model-de-domini]]: secció de la zona d'observació (`name` afegit al diagrama).
- [[postgres]]: taula `observation_zones` i ús de l'índex.
- Catàleg de codis de `gestio-errors`: els tres codis nous.

## Pendent / següents passos

- [ ] Obrir la PR 1 a `develop` quan Raquel ho demani (no s'ha fet push).
- [ ] TG-71: decidir si la consulta necessita un `LIMIT` (pregunta de la revisió).
- [ ] PR 2: llista de zones amb fonts, migració de seed i test del JSON.
