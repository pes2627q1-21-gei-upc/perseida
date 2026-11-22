---
titol: "Sessió 2026-11-22: retroalimentació de testing"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-657", "TG-352"]
font: "Petició de la persona responsable durant el pla de TG-352"
etiquetes: [sessio, testing, errors, vault, skills]
---

# Sessió 2026-11-22 · Retroalimentació de testing

## Objectiu

Abans d'implementar TG-352, deixar un mètode perquè els errors trobats en testing es registrin, es documentin i en surti una lliçó. Va en una PR a part (tasca TG-657, Sprint 2, sense US).

## Què s'ha fet

- Tasca TG-657 creada a Taiga (Sprint 2, sense US, etiquetes `documentacio` i `testing`), amb la confirmació de la persona.
- Convenció [[retroalimentacio-de-testing]]: quatre fases (`roig-inesperat`, `prova-manual`, `ci-mutants`, `review`), una nota per error, causa i no símptoma, lliçó i tancament.
- Plantilla `plantilles/error-de-testing` i registre `estat/errors/` amb la vista [[errors-de-testing.base]].
- Primera nota d'exemple, amb un error real de TG-385: [[2026-11-18-tg-385-href-null-amaga-la-ruta]].
- Enllaços des de [[testing]], [[definition-of-done]] (nou criteri), [[actualitzacio-del-vault]] i [[00-index]].
- Skills `implementar-us` (porta B de la fase 8 i informe) i `testing-tdd`, i subagent `qa-tester` (bloc `ERRORS TROBATS`). Sincronitzats amb `sync-skills.mjs` i `sync-agents.mjs`.

## Decisions preses

- Registre únic amb un `.base`, i no una secció per sessió (triat per la persona).
- El `qa-tester` no escriu al vault; retorna el bloc i l'agent principal crea les notes.

## Canvis al vault

- Nous: `convencions/retroalimentacio-de-testing`, `plantilles/error-de-testing`, `estat/errors/` (base i una nota).
- Modificats: `00-index`, `testing`, `definition-of-done`, `actualitzacio-del-vault`.

## Pendent / següents passos

- [ ] Obrir la PR de TG-657 (no s'ha fet commit, push ni PR) i fer-la revisar.
- [ ] Obrir el `.base` a Obsidian i comprovar que les vistes es veuen.
- [ ] Tornar a TG-352: plantejar les preguntes pendents del pla i la divisió en PR.

## US de Taiga

- TG-657
- TG-352
