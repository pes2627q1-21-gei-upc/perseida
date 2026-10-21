---
titol: "GitFlow i política de pull requests"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.2"
etiquetes: [convencio, git, gitflow, pull-requests]
---

# GitFlow i política de pull requests

## Regla

Tot el projecte viu en un únic monorepo a GitHub i segueix GitFlow. Cap canvi arriba a `main` ni a `develop` sense una pull request (PR).

## Model de branques

| Branca | Origen | Es fusiona a | Notes |
|---|---|---|---|
| `main` | permanent | | Codi en producció; cada canvi que hi arriba dispara el desplegament continu (CD). |
| `develop` | permanent | | Integració; les PR cap aquí disparen la CI i no es completen fins que és verda. |
| `feature/*` | `develop` | `develop` | Com a màxim una US completa. |
| `release/*` | `develop` | `main` i després `develop` | Una per sprint, abans de la sprint review; només bugfixes, documentació i canvis de versió. La talla el Scrum Master de l'sprint. |
| `hotfix/*` | `main` | `main`, `develop` i la `release/*` oberta (si n'hi ha) | Errors urgents en producció. |

Els noms usen el prefix seguit d'un nom breu i descriptiu. Els missatges de commit no tenen format rígid: n'hi ha prou que siguin explicatius.

## Pull requests i revisions

- Idealment, cada tasca té la seva branca i PR; es poden agrupar tasques de la mateixa US (totes passen alhora a READY FOR TEST).
- PR cap a `develop`: CI verda i almenys una aprovació d'una persona aliena al desenvolupament.
- PR cap a `main`: CI verda; l'aprovació és opcional (els hotfixes poden ser crítics).
- La plantilla de PR (`.github/pull_request_template.md`) l'elabora qui s'encarrega d'aquesta tasca.
- Estratègia de fusió: squash recomanat per a `feature/*` cap a `develop` (un commit per PR; un merge normal també és vàlid si l'autor ho considera millor); merge commit per a `release/*` i `hotfix/*` cap a `main` i per als seus retorns a `develop`.

## Protecció de branques

- Cap push directe a `main` ni a `develop`.
- Cap force push a `main` (a `develop` no es bloqueja).
- CI obligatòria i branca al dia amb la de destinació.
- A `develop`, mínim una aprovació d'algú diferent de l'autora, invalidada si s'hi puja codi nou.
- Totes les converses de la PR resoltes abans de fusionar.
- Les branques s'esborren automàticament un cop fusionades.
- Tots els membres són administradors, però les regles també s'hi apliquen.

## Releases i versionat

Versionat semàntic (SemVer, `MAJOR.MINOR.PATCH`) a partir de `0.1.0`: patch per bugfixes, minor per funcionalitat nova compatible, major per canvis incompatibles. Una release per sprint; un push a `main` equival a fusionar una release o un hotfix i dispara la CD. L'assignació de versions i la creació de releases les automatitza el pipeline de GitHub Actions.

## Enllaç amb Taiga

La integració de GitHub amb Taiga permet relacionar els commits i les pull requests (PR) amb les tasques i les històries d'usuari (US).

- Inclou la referència `TG-<ref>` al missatge del commit o a la descripció de la PR. Per exemple: `TG-33`.
- Opcionalment, es pot canviar l'estat de l'element afegint `TG-<ref> #<estat>`. Per exemple: `TG-33 #closed`.
- En fusionar una PR es genera un commit de fusió; si la descripció de la PR conté la referència, aquesta també arriba a Taiga quan es fusiona.

Estats vàlids per a les subtasques:

- `NEW`
- `IN PROGRESS`
- `READY FOR TEST`
- `CLOSED`
- `NEEDS INFO`

Estats vàlids per a les US (no coincideixen exactament amb els de les subtasques):

- `New`
- `Ready`
- `In progress`
- `Ready for test`
- `Done`
- `Archived`

Quan s'agrupen diverses tasques d'una mateixa US en una PR, totes les tasques implicades passen alhora a `READY FOR TEST` mentre esperen revisió.

## US de Taiga relacionades

- TG-85 (vault d'Obsidian)

## Enllaços

- [[definition-of-done]]: la PR revisada i la CI verda són part de la DoD.
- [[qualitat]]: comprovacions que executa la CI.
- [[0010-gitflow-i-politica-de-pull-requests]]: decisió que ho motiva.
