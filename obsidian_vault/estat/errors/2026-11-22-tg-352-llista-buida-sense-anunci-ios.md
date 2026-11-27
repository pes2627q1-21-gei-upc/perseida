---
titol: "TG-352: VoiceOver no anunciava la llista de locals buida"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 2 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: frontend
regressio: "frontend/src/features/meeting-points/components/MeetingPointList.test.tsx::announces on iOS that there are no places nearby"
commit: "b61b0b38"
llico: cap
etiquetes: [error-testing]
---

# TG-352: VoiceOver no anunciava la llista de locals buida

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Quan la càrrega acabava sense locals, VoiceOver (iOS) no anunciava «no hi ha locals recomanats a prop».

## Causa

L'estat buit de `MeetingPointList` només tenia `accessibilityLiveRegion="polite"`, que només funciona a Android. La guia d'accessibilitat de `frontend-component` demana també `AccessibilityInfo.announceForAccessibility` a iOS, i `OutingsStatus` ja ho fa.

## Correcció

Un `useEffect` anuncia el text de l'estat buit a iOS, amb el mateix patró que `OutingsStatus`.

## Test de regressió

`frontend/src/features/meeting-points/components/MeetingPointList.test.tsx`: «announces on iOS that there are no places nearby» i els tests que comproven que a Android i a web no hi ha anunci explícit (commit `b61b0b38`).

## Lliçó

Cap: la guia ja ho exigeix; error puntual d'aplicació.
