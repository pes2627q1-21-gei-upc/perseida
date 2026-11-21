---
titol: PR apilades amb l'extensió gh stack
tipus: guia
estat: vigent
data: 2026-11-19
us: ["TG-64"]
font: "gh stack v0.3.0 (--help de cada ordre, 19/11/2026); documentació oficial de GitHub sobre stacked PR (gh.io/stacks); TG-652"
etiquetes: [guia, git, pull-requests, gh-stack]
---

# PR apilades amb l'extensió gh stack

Quan una US es divideix en diverses PR que depenen les unes de les altres (per la mida del frontend, vegeu [[gitflow]] i [[0028-tdd-estricte-i-politica-de-testing-avancada]]), fem servir les **stacked PR natives de GitHub** amb l'extensió `gh stack`. GitHub reajusta sol la base de les PR de damunt quan es fusiona la de sota: **no cal canviar cap base a mà**.

> [!info] Què és verificat i què no
> Les seccions «Què fa GitHub» i «Ordres» surten de la documentació oficial i de la sortida de `gh stack <ordre> --help` (v0.3.0). La secció «Per verificar al primer ús» recull el que la documentació no diu i encara no hem provat en aquest repo.

## Requisits

- `gh` 2.90.0 o superior i Git 2.20 o superior (la documentació oficial); sessió iniciada amb `gh auth login`.
- Instal·lació: `gh extension install github/gh-stack`. Opcional, per als agents: `gh skill install github/gh-stack`.
- Totes les branques han de ser **al mateix repositori** (no hi ha stacks entre forks) i GitHub Desktop no ho admet.

## Què fa GitHub

- La PR de baix apunta al tronc (aquí `develop`); cada PR de damunt apunta a la branca de la de sota. Cada PR mostra només el diff de la seva capa, de manera que es poden revisar per separat.
- En fusionar la de baix, les branques restants es rebasen soles i la següent passa a apuntar a `develop`. Si es fusiona una PR del mig, també es fusionen les de sota i les de damunt es reapunten.
- Els requisits de fusió els decideix la **base de la PR de baix**: s'apliquen a totes les PR de l'stack la protecció de branques, les aprovacions i la CI (vegeu [[gitflow]], «Protecció de branques»).
- Es fusiona sempre de baix cap a dalt; fusionar la de dalt fusiona tot l'stack. Hi ha fusió atòmica (tot o res) i es respecta la cua de fusió si n'hi ha.
- Es poden fer servir els tres mètodes de fusió (merge commit, squash i rebase); l'historial resultant és com si es fusionessin una a una de baix cap a dalt.
- La documentació no dona cap límit de PR per stack.

## Ordres

| Ordre | Per a què |
|---|---|
| `gh stack init [branques…]` | Crea un stack. Amb noms de branques existents les adopta (de baix a dalt); amb `--base develop` fixa el tronc |
| `gh stack add [branca]` | Afegeix una branca a dalt de l'stack (`-Am "missatge"` fa commit i branca alhora) |
| `gh stack view` | Mostra branques i estat de les PR (`--short`, `--json`) |
| `gh stack push` | Puja les branques actives de manera atòmica (`--force-with-lease`) |
| `gh stack submit` | Puja, crea o actualitza les PR i crea l'stack a GitHub. `--auto` salta l'editor (les PR noves surten com a esborrany) i `--open` les marca llestes per a revisió |
| `gh stack sync` | Fetch, rebase en cascada, push i estat de les PR; útil després d'un merge |
| `gh stack rebase` | Rebase en cascada de tot l'stack (`--downstack`, `--upstack`) |
| `gh stack modify` | Reordenar, plegar, inserir, esborrar o reanomenar branques (TUI) |
| `gh stack link` | Enllaça branques o PR existents en un stack sense seguiment local |
| `gh stack merge` | Fusió atòmica fins a una PR (`--yes`, `--squash`) |
| `gh stack checkout`, `up`, `down`, `top`, `bottom`, `switch` | Navegació entre capes |
| `gh stack unstack` | Desfà l'stack al local i a GitHub |

## Flux a Perseida

1. Una branca `feature/TG-NN-<part>` per PR, en l'ordre del pla de la US (`implementar-us`), cada una sobre l'anterior.
2. Adopta-les com a stack: `gh stack init --base develop feature/TG-NN-a feature/TG-NN-b …`.
3. `gh stack submit` (editor interactiu) o, des d'un terminal no interactiu, `gh stack submit --auto`.
4. Revisa l'stack amb `gh stack view`; després de cada fusió, `gh stack sync`.
5. Cada PR segueix la política de [[gitflow]]: plantilla omplerta, TG-NN al títol, CI verda i una aprovació d'una persona que no sigui l'autora. Qui obre la PR n'és responsable ([[assistents-ia]]).

> [!warning] Els agents no pugen ni fusionen per iniciativa pròpia
> Segons `AGENTS.md`, un agent no fa `push`, `gh stack submit` ni `gh stack merge` si la persona no ho demana explícitament. Tampoc no pot saltar-se les proteccions de les branques.

## La base del diff a la CI en una PR apilada

En una PR d'un stack, el context del workflow `github.base_ref` val el **tronc de l'stack** (`develop`) i no la branca pare, encara que l'API REST de la PR (`base.ref`) digui la branca pare. Es va mesurar a la PR #130 (TG-64): el pas de Stryker va executar `--base-branch origin/develop`, va mutar tota la pila (27 fitxers, 1224 mutants) i va tardar 56 min 32 s dels 60 del job. Els dos jobs que mesuren només el codi nou de la PR (`frontend` i `backend`) fan servir ara la base real, i no `github.base_ref`:

- **Frontend (Stryker):** el workflow `ci.yml` passa `--pr-number` a `pnpm test:mutation`; l'script `frontend/scripts/run-stryker-diff.mjs` demana a l'API REST la base real de la PR i hi calcula el diff, de manera que cada capa només muta les seves línies (a la #130, 554 mutants en lloc de 1224).
- **Backend (`diff-cover` >= 90 % i `mutmut` >= 70 %):** un pas previ del job (`Base real de la PR`) executa `backend/scripts/pr_base.py`, que fa la mateixa consulta a l'API REST i en publica el resultat (`steps.pr_base.outputs.ref`); `diff-cover --compare-branch` i `run_mutmut_diff.py --base-branch` el reben per `env`. A la #130, `diff-cover` mesura 7 línies (les de la capa) en lloc de 30 (les de tota la pila), i `mutmut` no té cap fitxer de domini per mutar en lloc de tornar a mutar `app/domain/chat/models.py`, que és de la #126.

En els dos casos, si l'API falla, la branca no té un nom acceptable o no existeix en local, s'usa la base d'abans (`github.base_ref`); un missatge al log diu quina base s'ha fet servir i per què. Una PR ordinària (base `develop` o `main`) i un `push` no canvien. Si la branca pare ja s'ha fusionat, GitHub reajusta la base de la PR a `develop` i el càlcul segueix sent correcte. Per tant, el límit orientatiu de uns 400 mutants es compta **per capa**. Els jobs `frontend` i `backend` tenen `permissions: pull-requests: read` perquè el `GITHUB_TOKEN` pugui llegir la PR; `sonar` no fa servir `github.base_ref` (SonarQube Cloud decideix la base de la PR pel seu compte).

## Per verificar al primer ús

- Si `gh stack submit` fa servir la plantilla `.github/pull_request_template.md` o si el cos de la PR s'ha d'escriure amb `gh pr edit` després; la documentació no ho diu.
- Si l'assignació i els revisors s'han de posar a part (`gh pr edit --add-assignee --add-reviewer`); la documentació tampoc no ho diu.
- Com queda l'historial de commits `test:` abans de `feat:` en fusionar amb squash (vegeu [[gitflow]], «Ordre dels commits»).
- La regla de «branca al dia amb la de destinació» de [[gitflow]] respecte del rebase automàtic de l'stack.

## Enllaços

- [[gitflow]]
- [[definition-of-done]]
- [[assistents-ia]]
