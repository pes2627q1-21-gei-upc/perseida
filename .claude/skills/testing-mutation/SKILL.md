---
name: testing-mutation
description: Mutation testing de Perseida - mutmut al domini del backend i Stryker al frontend, només sobre els fitxers canviats de la PR, interpretació dels mutants supervivents i llindar de score >= 70 %. Usa-la quan modifiquis lògica de domini i vulguis comprovar que els tests detecten errors de debò, o quan hagis d'interpretar un informe de mutants.
---

# Testing: mutation testing

La cobertura diu quines línies s'executen, no si els tests detecten errors. El mutation testing canvia el codi (`>` per `>=`, `+` per `-`, treu una condició) i comprova que algun test falla; un mutant que sobreviu és un forat als tests.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Convenció: `obsidian_vault/convencions/testing.md`.

> [!warning] Eines previstes (US #359-#362)
> `mutmut` i Stryker **no estan instal·lats** al repo ni hi ha job de CI. La política (obligatori al domini, només sobre fitxers canviats, score >= 70 %) és vigent per a l'equip, però l'automatització és pendent. Fins llavors: si la persona ho aprova, instal·la l'eina amb `uv`/`pnpm` i versió fixada i executa-la en local; si no, deixa-ho anotat a la PR com a pendent. **Pregunta abans d'afegir cap dependència.**

## Quan usar-la / quan NO

- Usa-la: tota PR que canviï lògica de **domini** (backend `app/domain/`; la lògica de presentació crítica del frontend si la persona ho demana). Després de la fase verda del TDD, com a revisió dels tests.
- NO: infraestructura, adaptadors, routers, components visuals (soroll i temps de CPU sense valor), ni fitxers que no ha canviat la PR.
- No substitueix el TDD: el mutation testing audita els tests, no els escriu.

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Instal·lem l'eina ara (versió fixada) o ho deixem anotat com a pendent de la US de CI?
2. Un mutant supervivent és equivalent (no canvia el comportament observable) o és un forat? Si no n'estàs segur, pregunta.
3. Es pot excloure un fitxer o una línia (`# pragma: no mutate`)? Justifica'ls amb la persona.

## Flux

1. Acaba el cicle TDD (`testing-tdd`) amb tot en verd.
2. Obtén els fitxers de domini canviats a la PR (`git diff --name-only origin/develop...HEAD -- backend/app/domain`).
3. Executa mutmut **només sobre aquests fitxers** (mutmut 3.x: `[tool.mutmut] paths_to_mutate` o l'argument de fitxer; verifica la sintaxi a la versió instal·lada, no la suposis) i guarda l'informe (`mutmut results`).
4. Calcula el score: `mutants morts / (morts + supervivents)`, sense comptar els equivalents justificats. **Llindar: >= 70 %.**
5. Per a cada superviu: llegeix el mutant (`mutmut show <id>`), decideix si és equivalent o forat.
6. Forat: escriu un test que el mati (**primer en vermell** contra el mutant, commit `test:`), no canviïs el codi de producció per matar-lo.
7. Repeteix fins al llindar. Documenta a la PR el score i els equivalents.

Frontend: Stryker (`@stryker-mutator/core` amb el runner de Jest; **previst**, cal verificar la compatibilitat amb `jest-expo`) sobre els fitxers de lògica canviats, mateix llindar.

## Interpretar supervivents

| Patró del mutant | Probable causa | Acció |
|---|---|---|
| `>=` -> `>` (o a l'inrevés) | Falta test del valor límit | Test amb límit, límit - 1 i límit + 1 |
| Condició eliminada o `and` -> `or` | Cap test exerceix l'altra branca | Test per branca |
| Constant canviada (0 -> 1, `""`) | El test no comprova el valor | Assertion sobre el valor exacte |
| `raise` eliminat / `code` canviat | No es comprova el `code` de l'error | `pytest.raises` + assert sobre `code` |
| Retorn canviat per `None` | Test sense assert sobre el retorn | Assert del resultat |
| Només canvia un missatge de log o una docstring | Equivalent | Excloure amb justificació |
| Optimització que no canvia el resultat | Equivalent | Excloure amb justificació |

## Checklist final

- [ ] Preguntes resoltes amb l'humà (instal·lació, equivalents).
- [ ] Executat només sobre els fitxers de domini canviats.
- [ ] Score >= 70 % (o pendent anotat a la PR si l'eina encara no és instal·lada).
- [ ] Cada superviu és un test nou o un equivalent justificat per escrit.
- [ ] Cap test afeblit i cap codi de producció tocat per matar un mutant.
- [ ] Resultats reals reportats (no estimats).

## Què NO fer

- Perseguir 100 %: els mutants equivalents existeixen.
- Executar-lo sobre tot el repo a cada PR (és lent; per això només el diff).
- Excloure fitxers o línies sense justificació.
- Inventar xifres de score si no l'has executat.
- Afegir `mutmut`/Stryker sense preguntar; fer push, merge o PR.
