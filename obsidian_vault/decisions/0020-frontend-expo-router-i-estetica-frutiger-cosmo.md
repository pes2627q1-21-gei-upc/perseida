---
titol: "Frontend: Expo Router, stack d'UI i estètica Frutiger Cosmo"
tipus: adr
estat: proposada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable"
etiquetes: [adr, frontend, ui, ux, responsive]
---

# ADR-0020 · Frontend: Expo Router, stack d'UI i estètica Frutiger Cosmo

## Context

[[frontend]] deixava sense decidir l'estructura de carpetes, el sistema d'estils i la direcció visual. Els agents necessiten una guia única per generar UI coherent.

## Decisió

- **Estructura**: Expo Router amb `frontend/src/app/` (grups `(app)` per al mòbil i `(admin)` per a l'escriptori), `src/features/<mòdul>/{components,hooks,api}` i `src/shared/{ui,theme,api,errors,i18n}`.
- **Stack**: NativeWind amb *tokens* de tema propis i components base «glossy» (`expo-linear-gradient`, `expo-blur`, `react-native-svg`); `openapi-typescript` + `openapi-fetch` + TanStack Query; *toast* propi; `react-hook-form` + `zod` (validació de comoditat; la vàlida és la del backend).
- **Estètica «Frutiger Cosmo»**, inspirada en l'iPhone 4 i la Wii: base fosca còsmica i glossy (vidre translúcid, gradients, reflexos, botons de gel, bombolles). La paleta i la tipografia concretes les valida la persona.
- **Responsive al 100 %, mobile-first**: l'app, pensada per a mòbils actuals; el panell d'admin, per a portàtil; tot s'ha de veure bé a qualsevol resolució.
- **Frontend «tonto»**: sense regles de negoci ni de seguretat; mai errors crus (vegeu [[0018-errors-rfc-9457-amb-codis-estables]]).
- Es vendoritzen les skills `ui-ux-pro-max` (MIT) i `frontend-design` (Apache-2.0) per decidir amb criteri.

## Conseqüències

### Positives

- Identitat visual pròpia i coherent; tots els agents parteixen de la mateixa guia.

### Negatives (assumides)

- Els efectes glossy i el blur tenen cost de rendiment que cal vigilar en mòbils modestos.

## Alternatives descartades

- Expo Router a `app/` de l'arrel, React Navigation, `StyleSheet` pur o un UI kit (Tamagui): descartats per la persona.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[frontend]]
- [[0011-client-offline-sqlite-last-write-wins]]
- [[0021-subagents-agnostics-i-generador]]
