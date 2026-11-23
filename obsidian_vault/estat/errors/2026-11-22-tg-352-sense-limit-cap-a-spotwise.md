---
titol: "TG-352: cap límit de crides cap a Spotwise"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 1 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: backend
regressio: "backend/tests/unit/infrastructure/meeting_points/test_spotwise_client.py::test_tg352_the_limit_is_a_sliding_minute"
commit: "59437ab6"
llico: skill
etiquetes: [error-testing]
---

# TG-352: cap límit de crides cap a Spotwise

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

[[contracte-spotwise]] demana no passar de 60 peticions per minut. Cada ubicació nova sense cache feia una crida a Spotwise, i qualsevol usuària amb sessió podia superar el límit acordat.

## Causa

El pla i l'encàrrec al subagent no van tractar el límit de quota del servei extern, tot i que és una de les preguntes obligatòries de la skill `backend-adaptador` («límits de quota/rate limit»). Només es va comptar amb la cache de 5 min.

## Correcció

Finestra lliscant de 60 crides per minut al `SpotwiseSpaceClient`, una instància per procés. La crida 61 respon `503 MEETING_POINTS_UNAVAILABLE` sense cridar Spotwise (decisió de Raquel, 22/11/2026).

## Test de regressió

`backend/tests/unit/infrastructure/meeting_points/test_spotwise_client.py::test_tg352_the_limit_is_a_sliding_minute` i `::test_tg352_a_failed_call_counts_towards_the_limit`.

## Lliçó

Mateixa causa que [[2026-11-22-tg-352-copia-openapi-desfasada]]: vegeu-hi la lliçó.
