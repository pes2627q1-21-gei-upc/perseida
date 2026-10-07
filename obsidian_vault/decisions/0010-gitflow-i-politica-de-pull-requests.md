---
titol: "GitFlow i política de pull requests"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-33"]
font: "memòria §2.2; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, git, gitflow, pull-requests]
---

# ADR-0010 · GitFlow i política de pull requests

## Context

Un equip de sis persones treballa sobre un únic monorepo ([[0001-monorepo-quatre-directoris]]) amb integració i desplegament continus (memòria §2.2).

## Decisió

El repositori segueix GitFlow, metodologia que els professors de l'assignatura van recomanar: `main` (producció, dispara la CD) i `develop` (integració, dispara la CI) com a branques permanents, i `feature/*`, `release/*` i `hotfix/*` com a temporals. Cap canvi arriba a `main` ni a `develop` sense PR. Les PR cap a `develop` necessiten CI verda i almenys una aprovació d'una persona aliena al desenvolupament; cap a `main` cal CI verda però l'aprovació és opcional. Les branques principals estan protegides (sense push directe, sense force push a `main`). Es recomana squash per a les PR de feature i es fa merge commit per a release i hotfix. Les versions són SemVer des de `0.1.0`, amb una release per sprint.

## Conseqüències

### Positives

- Un push a `main` equival a fusionar una release o un hotfix i dispara la CD.
- Merge commit a release i hotfix evita que els historials de `main` i `develop` divergeixin i es produeixin conflictes.
- Squash en les features manté un historial net, amb un commit per PR.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-33 (convencions de branques, commits i plantilla de pull request)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[gitflow]]
- [[definition-of-done]]
- [[qualitat]]
- [[arquitectura-fisica]]
- [[0012-sonarqube-cloud-i-quality-gate]]
