---
titol: "Retroalimentació de testing"
tipus: convencio
estat: vigent
data: "2026-11-22"
us: ["TG-657"]
font: "Decisió de la persona responsable (22/11/2026); precedent: errors de la prova manual i de la review de TG-385 anotats a la sessió del 18/11/2026"
etiquetes: [convencio, testing, errors, retroalimentacio, qualitat]
---

# Retroalimentació de testing

## Regla

Tot error que apareix **durant el testing o la verificació d'una US** es registra, es documenta i se n'extreu la lliçó. Un error que només queda en un commit o en una nota de sessió es torna a cometre.

## Quan s'aplica

Es registra un error quan passa un d'aquests casos:

| Fase (`fase`) | Què és |
|---|---|
| `roig-inesperat` | El test en vermell falla per un motiu que no és el previst (configuració, suposició errònia, dades, test inestable) o passa a la primera. |
| `prova-manual` | Es veu a la prova manual (web, Android, TalkBack) i els tests no l'havien detectat. |
| `ci-mutants` | La CI es trenca o es cancel·la, cau la cobertura o sobreviuen mutants que revelen un test que no comprova res. |
| `review` | El revisor assenyala un defecte de la PR (no un matís d'estil). |

No es registra: un test que falla pel motiu previst (és el roig normal del TDD), ni un error de sintaxi que es corregeix abans del commit.

## Com es compleix

1. **Anota'l en el moment**, amb la plantilla `plantilles/error-de-testing`, a `estat/errors/AAAA-MM-DD-TG-NN-resum.md`. Un error = una nota.
2. **Reprodueix-lo amb un test** (`test:` abans del `fix:`, [[testing#TDD]]). Si no es pot automatitzar, diu per què i com es comprova a mà.
3. **Escriu la causa, no el símptoma.** «Falla el botó» és un símptoma; «`href: null` treu la ruta del navegador» és una causa.
4. **Decideix la lliçó** (camp `llico`): què canvia perquè no es repeteixi.
   - `skill`: s'ha ampliat una skill o un subagent a `.agents/` (després, `node .agents/scripts/sync-skills.mjs` i `sync-agents.mjs`).
   - `convencio`: s'ha ampliat una nota de `convencions/`.
   - `cap`: cas aïllat; cal dir-ne el motiu.
5. **Tanca'l:** `estat: corregit` quan el test de regressió és a la suite i la lliçó s'ha aplicat. Els errors oberts a l'acabar la US es porten a Taiga.
6. **Revisa el registre** a la sessió i a la retrospectiva: si una `causa` es repeteix dues vegades, la lliçó passa a ser obligatòria (`skill` o `convencio`).

La vista [[errors-de-testing.base]] llista el registre i es filtra per fase, US i estat.

## Qui

- L'autor de la PR (persona o assistent d'IA) crea les notes d'error amb la skill `obsidian-markdown`; el `.base` amb `obsidian-bases`.
- El subagent `qa-tester` no escriu al vault: retorna un bloc `ERRORS TROBATS` a l'agent principal, que crea les notes.
- El revisor comprova a la PR que els errors de la US són al registre.

## Exemples

- [[2026-11-18-tg-385-href-null-amaga-la-ruta]]: error de la prova manual, amb regressió amb el router real.

## Excepcions

- Els errors de producció (hotfix) es documenten igual, amb `fase: prova-manual` si els ha trobat una persona i `review` si els ha vist un revisor; l'`us` és la que va introduir el defecte.
- No hi van secrets, tokens ni dades personals ([[actualitzacio-del-vault]]).

## US de Taiga relacionades

- TG-657
- TG-385 (origen dels primers errors anotats)
