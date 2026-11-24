---
titol: "Sessió 2026-11-24: contrast dels spinners de càrrega (TG-658)"
tipus: sessio
estat: vigent
data: "2026-11-24"
us: ["TG-658"]
font: "Issue TG-658 de Taiga; codi a frontend/src/shared/ui/StatusPanel.tsx i frontend/src/features/outings/components"
etiquetes: [sessio, frontend, accessibilitat]
---

# Sessió 2026-11-24 · Contrast dels spinners de càrrega

## Objectiu

L'spinner de `StatusPanel` anava directament sobre el cel i, al tema posta, feia 2,33:1, per sota del 3:1 de WCAG 1.4.11 (TG-658).

## Què s'ha fet

- **Spinners sobre vidre:** `StatusPanel`, `EventField` i `RecommendedPlaces` posen l'`ActivityIndicator` dins d'un `GlassPanel`, com ja feia `MeetingPointsScreen`. Són els únics spinners que quedaven directament sobre el cel; la resta ja anaven sobre vidre o sobre una píndola amb fons.
- **Tests en vermell abans del codi (ADR-0028):** ajudant `isOnGlass` (`frontend/__mocks__/onGlass.ts`) i un test per component.
- **Issue de Taiga:** ampliada la descripció amb els dos components nous i la llista de spinners que ja són correctes.

## Mesura (contrast.py, `text.primary` sobre `surface.glass`, pitjor punt del cel)

| Tema | Contrast |
|---|---|
| dia | 13,81:1 i 15,00:1 |
| posta | 14,41:1 i 8,27:1 |
| nit | 16,34:1 i 15,69:1 |
| vermell | 11,57:1 i 11,41:1 |

## Decisions preses

Cap ADR nova. Un únic criteri: tot spinner de càrrega va sobre vidre.
