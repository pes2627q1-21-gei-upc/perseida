---
titol: "Sessió 2026-11-21 · Atendre les reviews de la pila de TG-64 i del domini del xat directe"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-64", "TG-469", "TG-470", "TG-399", "TG-400"]
font: "Reviews de les PR #125, #126, #127, #130 (pila #128) i #132 a GitHub; branques feature/TG-64-* i feature/TG-399-TG-400-domini-xat-directe; conflictes amb develop després de la fusió de #129"
etiquetes: [sessio, xat, pr-apilades, review]
---

# Sessió 2026-11-21 · Atendre les reviews de la pila de TG-64 i del domini del xat directe

## Objectiu

Atendre amb criteri tècnic les reviews de la pila #128 (#125, #126, #127 i #130) i de la PR #132 (domini del xat directe), i resoldre els conflictes amb `develop` que va deixar la fusió de #129.

## Què s'ha fet

- **Conflictes amb `develop`:** #125 i #132 xocaven al frontmatter de `model-de-domini.md` (es van conservar les dues bandes); #125 també a `openapi.json`, que es va regenerar i es va deixar en LF (l'exportador escriu CRLF a Windows). La pila es va rebasar capa per capa amb `git rebase --onto` i es van resoldre els conflictes que van sortir a les capes de dalt.
- **#126:** estils a `createStyles(theme)`, entrada de les files a 120 ms sense *stagger* i títol de l'esdeveniment sense `numberOfLines`.
- **#127:** el compositor només buida el text enviat i conserva el que s'escriu mentre s'envia; bombolla a 120 ms; `LOAD_OLDER_THRESHOLD` fora del bloc de Stryker; `font` de la nota de la PR C amb els SHA actuals; stacks recollits a `gitflow.md` i `AGENTS.md`.
- **#130:** els missatges en viu i l'ack d'un enviament propi que arriben durant una petició de l'historial es tornen a aplicar quan acaba (bug de `useRoomLive`, amb test en vermell abans); `ActionSurface` a `createStyles`; ADR-0033 `acceptada` i el seu pas 5 corregit.
- **#132:** qui no és participant rep `CONVERSATION_NOT_FOUND`; `CANNOT_MESSAGE_SELF` i `CONVERSATION_NOT_FOUND` al catàleg de codis; fakes a `backend/tests/fakes/`; `UserBlockRepository.block()` rep l'entitat `UserBlock`.
- **README** de l'arrel i del frontend (en tres idiomes) amb l'excepció dels stacks.

## Decisions preses

- Els arreglos van a la capa de la pila a la qual correspon cada punt, no tot a la #130.
- Una `feature/*` surt de `develop`; en una pila de PR apilades surt de l'anterior (cada PR apunta a l'anterior i la primera a `develop`). Vegeu [[gitflow]] i [[pr-apilades-amb-gh-stack]].
- A la CI, `github.base_ref` val el tronc de la pila, no la branca pare: a les capes de sota de la #130 Stryker muta també les capes inferiors. La #130 fa que la CI diffegi cada capa contra la seva base real.
- Un no-participant no revela que la conversa existeix: el domini llança `NotFoundError` amb `CONVERSATION_NOT_FOUND`, no un codi propi del xat directe.
- Decisió d'estil: les animacions d'entrada de llistes i bombolles són de 120 ms (`duration.fast`), per la porta de moviment nou de `so-i-moviment.md`. Context: [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]].
- L'ADR-0033 passa a `acceptada` com es va fer amb l'ADR-0030 ([[0033-xat-per-esdeveniment-sala-missatge-i-flux]], [[0030-protocol-websocket-i-revocacio-per-pub-sub]]).

## Canvis al vault

- [[gitflow]] i `AGENTS.md`: excepció dels stacks per a les `feature/*`.
- [[pr-apilades-amb-gh-stack]]: Stryker, `diff-cover` i `mutmut` en una pila.
- [[0033-xat-per-esdeveniment-sala-missatge-i-flux]]: estat `acceptada` i pas 5.
- Nota de sessió de la PR C (`font` amb SHA actuals) i de la PR D.
- Catàleg de codis de la skill `gestio-errors` (i la còpia a `.claude/skills`).
- Aquesta sessió.

## Pendent / següents passos

- [ ] Que la CI de les cinc PR acabi en verd (algunes execucions es van cancel·lar en reeditar les PR) i que la gent revisora les tornin a mirar.
- [ ] Textos ca/es/en de `CANNOT_MESSAGE_SELF` i `CONVERSATION_NOT_FOUND` al catàleg: «(pendent, preguntar)».
- [ ] Els codis `USER_NOT_FOUND` i `USER_BLOCKED` s'hauran d'afegir al catàleg quan els llanci el servei (#401/#402).

## Verificat / no verificat

- Verificat en local, a cada capa: `lint`, `typecheck` i tests del frontend; al backend de #132, `ruff`, `format`, `mypy`, `lint-imports` i tests unitaris.
- No verificat aquí: l'estat final de la CI, SonarCloud i la mutation a la CI, ni cap prova en dispositiu.

## US de Taiga

- TG-64, TG-469, TG-470, TG-399, TG-400
