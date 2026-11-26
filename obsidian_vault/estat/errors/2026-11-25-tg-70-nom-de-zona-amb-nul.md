---
titol: "El nom d'una zona d'observació acceptava el caràcter NUL"
tipus: error-testing
estat: corregit
data: "2026-11-25"
us: ["TG-70"]
font: "Revisió de reviewer-arquitectura de la PR 1 de TG-70 (2026-11-25)"
fase: review
capa: domain
regressio: "backend/tests/unit/domain/observation_zones/test_models.py::test_tg70_c1_a_zone_name_cannot_be_blank_nor_have_nul"
commit: "55001794"
llico: cap
etiquetes: [error-testing, backend, domini, zones]
---

# El nom d'una zona d'observació acceptava el caràcter NUL

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

`ObservationZone.create(name="Mont\x00sec", ...)` es construïa sense error; en desar-la, PostgreSQL rebutjaria el `TEXT` amb un error del driver (500 quan hi hagi endpoint o seed).

## Causa

`ZoneName` només demanava text no buit; no es va reutilitzar la restricció sense NUL que ja tenen els textos dels esdeveniments (`app/domain/events/models.py`).

## Correcció

`ZoneName` afegeix `pattern=r"^[^\x00]*$"`, com els esdeveniments.

## Test de regressió

`backend/tests/unit/domain/observation_zones/test_models.py::test_tg70_c1_a_zone_name_cannot_be_blank_nor_have_nul`.

## Lliçó

Cap: el patró ja existia i el va detectar la revisió; és el primer cas registrat.
