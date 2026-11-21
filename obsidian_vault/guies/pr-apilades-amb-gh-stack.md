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

## Stryker i les PR apilades

El job de mutation testing del frontend de la CI (`.github/workflows/ci.yml`) corre amb `--base-branch origin/${{ github.base_ref }}`: la base és la de la PR, és a dir, la branca de la PR de sota de la pila (o `develop` per a la primera). Per tant, a cada capa només es muten les línies que aquella PR afegeix, i el límit orientatiu de uns 400 mutants es compta per capa (TG-652). Si algú executa Stryker en local amb `--base-branch origin/develop`, es mutaran també les línies de les capes de sota.

## Per verificar al primer ús

- Si `gh stack submit` fa servir la plantilla `.github/pull_request_template.md` o si el cos de la PR s'ha d'escriure amb `gh pr edit` després; la documentació no ho diu.
- Si l'assignació i els revisors s'han de posar a part (`gh pr edit --add-assignee --add-reviewer`); la documentació tampoc no ho diu.
- Com queda l'historial de commits `test:` abans de `feat:` en fusionar amb squash (vegeu [[gitflow]], «Ordre dels commits»).
- La regla de «branca al dia amb la de destinació» de [[gitflow]] respecte del rebase automàtic de l'stack.

## Enllaços

- [[gitflow]]
- [[definition-of-done]]
- [[assistents-ia]]
