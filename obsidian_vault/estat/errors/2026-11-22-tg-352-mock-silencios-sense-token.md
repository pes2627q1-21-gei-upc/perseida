---
titol: "TG-352: el mock de Spotwise s'activava en silenci sense token"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 1 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: backend
regressio: "backend/tests/unit/infrastructure/meeting_points/test_spotwise_examples.py::test_tg352_c3_choosing_the_mock_is_warned"
commit: "94f008d7"
llico: cap
etiquetes: [error-testing]
---

# TG-352: el mock de Spotwise s'activava en silenci sense token

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Si `SPOTWISE_API_TOKEN` faltava en temps d'execució, producció servia els espais d'exemple com si fossin reals, sense cap avís.

## Causa

La tria entre mock i client real depenia només del token (decisió del pla) i no deixava cap rastre. El CD exigeix el secret, però el backend no ho comprovava.

## Correcció

`build_space_search` registra un WARNING a l'arrencada quan tria `ExampleSpaceSearch` (decisió de Raquel, 22/11/2026).

## Test de regressió

`backend/tests/unit/infrastructure/meeting_points/test_spotwise_examples.py::test_tg352_c3_choosing_the_mock_is_warned` i `::test_tg352_c2_choosing_the_spotwise_client_is_not_warned`.

## Lliçó

Cap: primer cas de mock triat per configuració; si se'n fan més, cal una regla a [[backend-hexagonal]].
