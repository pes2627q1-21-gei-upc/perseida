---
titol: "TG-352: tests d'anunci que passaven en buit perquè el spy no es netejava"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Verd de les correccions de review de la PR 2 de TG-352 (subagent frontend, 22/11/2026)"
fase: roig-inesperat
capa: frontend
regressio: "frontend/src/features/meeting-points/components/MeetingPointList.test.tsx (grup «MeetingPointList announcements»)"
commit: "1ddce51b"
llico: cap
etiquetes: [error-testing]
---

# TG-352: tests d'anunci que passaven en buit perquè el spy no es netejava

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Els tests «no anuncia la llista», «no anuncia a Android» i «no anuncia a web» passaven a la fase vermella i, un cop afegit l'anunci a iOS, van fallar amb «Number of calls: 1». Executats sols, passaven.

## Causa

Al setup de jest, `AccessibilityInfo.announceForAccessibility` ja és un `jest.fn()`. `jest.spyOn` sobre un mock retorna el mateix mock, i `afterEach(jest.restoreAllMocks)` no en buida les crides. Cada test comptava els anuncis dels anteriors. Abans del verd passaven en buit, perquè el component no anunciava res.

## Correcció

Un helper `announceSpy()` del grup fa `jest.spyOn` i tot seguit `mockClear()`, només sobre el mock de l'anunci. El codi del component no canvia. Comprovat amb tres mutacions a mà: anunciar a tots els sistemes, anunciar amb la llista plena i no anunciar mai fan fallar el test que toca.

## Test de regressió

El grup «MeetingPointList announcements» de `MeetingPointList.test.tsx`; cadascun dels tres tests falla si el component anuncia en aquell cas.

## Lliçó

Cap: primer cas. Si es repeteix, cal dir a `testing-tdd` que un spy sobre un mock global del setup s'ha de netejar a `beforeEach`, i que un test de «no passa X» s'ha de veure fallar.
