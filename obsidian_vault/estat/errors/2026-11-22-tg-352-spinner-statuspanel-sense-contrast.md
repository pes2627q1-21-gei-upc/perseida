---
titol: "TG-352: l'spinner de StatusPanel no arriba a 3:1 sobre el cel de posta"
tipus: error-testing
estat: obert
data: "2026-11-22"
us: ["TG-352"]
font: "Verd de les correccions de review de la PR 3 de TG-352 (subagent frontend, 22/11/2026); issue #658 de Taiga"
fase: review
capa: frontend
regressio:
commit:
llico: cap
etiquetes: [error-testing]
---

# TG-352: l'spinner de StatusPanel no arriba a 3:1 sobre el cel de posta

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

En mesurar el contrast de `MeetingPointsScreen`, l'spinner de càrrega de `shared/ui/StatusPanel` (`text.primary`) va directament sobre el `SkyBackground` i fa 2,33:1 sobre la part baixa del cel del tema posta (WCAG 1.4.11 en demana 3:1). Afecta també APOD i el quiz.

## Causa

`StatusPanel` no posa vidre darrere de l'spinner, i el contrast només s'havia mesurat sobre la part alta del cel.

## Correcció

Pendent: issue #658 de Taiga, fora de TG-352 (decisió de Raquel, 22/11/2026). A TG-352, el títol i l'spinner de `MeetingPointsScreen` ja van sobre `GlassPanel` (8,27:1 o més als quatre temes).

## Test de regressió

Pendent amb la issue #658: mesura amb `.agents/skills/estetica-frutiger-cosmo/scripts/contrast.py` als quatre temes, sobre la part alta i la baixa del cel.

## Lliçó

Pendent de decidir en tancar la issue.
