---
titol: "TG-59: el test en vermell fallava per un import que no existia i amagava errors del propi test"
tipus: error-testing
estat: corregit
data: "2026-11-25"
us: ["TG-59"]
font: "Verd de les tasques #578 (trofeu i finestra) a la sessió de TG-59, 25/11/2026"
fase: roig-inesperat
capa: frontend
regressio: "frontend/src/features/achievements/components/AchievementTrophy.test.tsx i AchievementDialog.test.tsx"
commit:
llico: skill
etiquetes: [error-testing]
---

# TG-59: el test en vermell fallava per un import que no existia i amagava errors del propi test

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Els tests de `AchievementTrophy` i `AchievementDialog` eren en vermell per «Cannot find module». En escriure el component, van fallar per altres motius que no eren del component: `render function has not been called`, un `onPress` que es disparava en un candau i un `afterEach` que feia fallar el panell de vidre.

## Causa

Tres errors del propi test, que el vermell per mòdul inexistent no deixava veure:

- A RNTL 14, `render` i `fireEvent` són asíncrons i s'esperen amb `await`; el test no ho feia.
- `fireEvent.press` també crida el `onPress` de la propietat del component, no només el d'un element de pantalla, així que no provava que el candau no es pot prémer.
- `jest.resetAllMocks()` esborrava un simulador global d'accessibilitat (`AccessibilityInfo`) que necessita el panell de vidre.

## Correcció

`await` a `render` i `fireEvent`; el test del candau comprova que no hi ha cap botó; l'`afterEach` reinicia només el mock de compartir.

## Test de regressió

Els mateixos tests, ja en verd, a `AchievementTrophy.test.tsx` i `AchievementDialog.test.tsx`.

## Lliçó

Skill `testing-tdd`: un test en vermell només és bo si falla pel motiu correcte. Quan el vermell és «mòdul inexistent», el test pot tenir errors que no es veuen fins al verd; cal crear primer un component buit que exporti el nom i comprovar que el test falla per l'aserció, no per l'import. Pendent de portar-ho a la skill.
