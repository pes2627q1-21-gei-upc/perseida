---
titol: "Sessió 2026-11-21: auditoria de les dependències del frontend (TG-338)"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-338"]
font: "Taiga: US TG-338; pnpm audit sobre el lockfile de develop (c5be061); xat de l'equip del 21/11/2026"
etiquetes: [sessio, frontend, seguretat, dependencies]
---

# Sessió 2026-11-21 · Auditoria de les dependències del frontend (TG-338)

## Objectiu

TG-338: corregir o triar les vulnerabilitats de les dependències del frontend.

## Què s'ha fet

- **Auditoria refeta (CA1):** 9 vulnerabilitats (1 alta), 4 d'elles en producció, a `develop` c5be061. La taula es va publicar com a comentari a la US.
- **Canvis (un commit cadascun):**
  - `expo` 58.0.26 i l'SDK alineat.
  - `postcss-selector-parser` 6.1.6.
  - Override de `qs` (`typed-rest-client>qs: 6.17.1`).
  - Fora `@expo/ngrok`.
  - `@react-native/jest-preset` 0.88.1, el peer que demana `jest-expo` 58.0.15.
  - `babel-preset-expo` 58.0.26, la versió que demana `expo` 58.0.26 (es va detectar a la revisió).
- **Verificació:**
  - `pnpm install --frozen-lockfile`, lint, typecheck i 108 suites / 1267 tests en verd abans i després.
  - `expo prebuild --platform android --clean` igual que a `develop` (mateix únic avís, `expo-system-ui`).
  - `expo start` i `expo export --platform web` correctes.
  - Stryker funciona amb el nou `qs` (34 mutants a `safeUrl.ts`, 79,41 %).

## Decisions preses

- `app.json` no es toca: `expo install --fix` hi volia afegir config plugins, fora d'abast.
- Els `minimumReleaseAgeExclude` antics es deixen.
- Riscos acceptats (`minimatch`, `glob`) documentats a [[seguretat#Estat a 2026-11-21]], amb revisió com a molt tard el 2026-12-21. Gestors de dependències: [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]].
- **CA5:** l'equip va decidir el 21/11/2026 al xat de l'equip que el pas `pnpm audit --prod --audit-level=high` del CI sigui **bloquejant**. El pas el crea TG-384 (PR #134) com a avís; el fa bloquejant la mateixa #134 quan TG-338 sigui a `develop` (sense TG-338 fallaria per `zod`).

## Canvis al vault

- [[seguretat]]: taula «Estat a 2026-11-21» de la secció «Dependències».

## Pendent / següents passos

- [ ] Avisos de peers que ja hi eren a `develop`, candidats a una US a part: `@react-native/metro-config` 0.87.1 vs 0.88.1; `typescript` 6 vs `^5` d'`openapi-typescript`.
- [ ] Netejar les entrades de `minimumReleaseAgeExclude` (`frontend/pnpm-workspace.yaml`) que ja no es resolen (`expo@58.0.19`, `@expo/cli@58.1.15`…); inòcues, US a part.
- [ ] Fer bloquejant el pas d'auditoria del CI a la PR #134 (TG-384) quan TG-338 sigui a `develop`.

## US de Taiga

- TG-338
- TG-384
