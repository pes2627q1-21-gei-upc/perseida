---
titol: "Sessió 2026-11-24 · TG-65: mutació i pila de lectura"
tipus: sessio
estat: vigent
data: "2026-11-24"
us: ["TG-65"]
font: "Taiga TG-65; PR #154, #163 i #164; CI 45471190997, 45475096219 i 45475332864"
etiquetes: [sessio, xat, pr-apilades, testing]
---

# Sessió 2026-11-24 · TG-65: mutació i pila de lectura

## Objectiu

Reprendre la feina de TG-65 sense repetir canvis ja fets, resoldre el llindar de mutació de #154 i sincronitzar les PR de lectura posteriors amb els caps actuals de la pila.

## Què s'ha fet

- #154: la CI `45471190997` passa amb Stryker 71,26 % (356 morts, 1 timeout, 138 supervivents, 6 sense cobertura i 0 errors) i Sonar Quality Gate verd. El mutant `total === 0 → true` continua sense classificar-se ni excloure's. S'ha tancat i publicat la nota d'incidència [[2026-11-24-tg-65-stryker-integra-xat]].
- #163: rebase `--onto` sobre el cap estable de #154 `569b9ab2`, preservant els commits propis des de `cb097be9`; publicat amb lease sobre el head original `0dba3327`. Nou head `bdf84e80`. La CI `45475096219` passa: 2746 tests backend, 2502 tests frontend, Stryker 83,33 % i Sonar Quality Gate verd.
- #164: rebase `--onto` sobre #163 `bdf84e80`, preservant cinc commits de codi/proves i dos de documentació; publicat amb lease sobre el head original `4f1595b2`. Nou head del rebase `7c24a66e`; la nota de sessió es va publicar a `dc18cc58`. La CI `45475788186` passa sobre aquest head: 198 suites/2504 tests frontend, Stryker 88,24 % i Sonar Quality Gate verd. Les notes d'error publicades són [[2026-11-24-tg-65-client-no-enviava-cursor-lectura]], [[2026-11-24-tg-65-expectativa-obsoleta-historial-buit]], [[2026-11-24-tg-65-fixture-historial-desfasada-despres-de-rebase]], [[2026-11-24-tg-65-stryker-cursor-lectura]] i [[2026-11-24-tg-65-stryker-integra-xat]].
- La pila nativa #165 conserva l'ordre complet `#148 → #149 → #150 → #151 → #153 → #158 → #160 → #162 → #154 → #163 → #164`. Totes les PR continuen drafts; no s'ha fusionat res ni s'han canviat estats a Taiga.
- Després dels rebases passen localment: #163, 18 suites/165 tests frontend, typecheck, ESLint i Prettier; #164, 18 suites/167 tests, typecheck, ESLint, Prettier i `git diff --check`. Al backend de #163 passen 59 tests; 124 proves d'integració s'han omès perquè aquest entorn no defineix `POSTGRES_HOST` ni Redis.
- La CI `45475096219` de #163 i la CI substitutiva `45475788186` de #164 passen. El run intermedi `45475332864` es va cancel·lar en publicar la nota de sessió. La nota `stryker-cursor-lectura` s'ha actualitzat i publicat amb els dos supervivents i el resultat post-rebase de #163; els checks actuals de GitHub són la font autoritativa per al cap més recent.

## Decisions preses

- No s'ha pres cap decisió nova d'arquitectura; es manté el contracte de cursor de lectura existent.
- Preservar el número i la membership de la pila #165, rebasar de baix a dalt i protegir cada actualització remota amb el lease del head original.
- No fusionar PR ni modificar l'estat de Taiga sense instrucció específica.

## Canvis al vault

- Actualitzada i publicada la nota d'incidència de Stryker de #154; publicades les cinc notes d'error de #163/#164 amb l'evidència post-rebase de #163.
- Aquesta nota de sessió.

## Pendent / següents passos

- [ ] Verificar els checks del cap resultant després de les actualitzacions documentals i reflectir l'evidència final a les descripcions.
- [ ] Mantenir les PR com a drafts fins a revisió humana; no tancar Taiga ni fusionar.

## Verificat / no verificat

- Verificat localment: Jest directe de les dues capes de frontend, typecheck, ESLint, Prettier i diff whitespace; 59 tests backend passats.
- No verificat localment: els 124 tests d'integració backend que necessiten PostgreSQL i Redis; corresponen als serveis reals de CI.

## US de Taiga

- TG-65
