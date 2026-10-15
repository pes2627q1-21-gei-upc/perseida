---
titol: "Monorepo amb quatre directoris"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-30"]
font: "memòria §2.2; README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, repositori, monorepo]
---

# ADR-0001 · Monorepo amb quatre directoris

## Context

El projecte té diverses parts (aplicació mòbil, API, infraestructura i documentació) i un equip de sis persones full stack que treballa sobre totes. Un mateix canvi pot afectar diverses parts del sistema, per exemple una funcionalitat que toca tant l'aplicació com l'API (memòria §2.2).

## Decisió

Tot el projecte viu en un únic monorepo a GitHub amb, en directoris separats, els quatre components principals: `backend/`, `frontend/`, `infra/` (Docker i configuració de desplegament) i `obsidian_vault/` (documentació com a vault d'Obsidian). No es descarta afegir-hi més directoris si apareix la necessitat.

## Conseqüències

### Positives

- Un canvi que afecta diverses parts del sistema es pot integrar en una sola pull request.
- Tot l'equip treballa sobre un únic punt de veritat.
- Les regles de qualitat viuen en fitxers de configuració versionats al mateix monorepo i són idèntiques per a tot l'equip.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-30 (estructura del monorepo amb els quatre directoris i guia d'arrencada)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[visio-general]]
- [[gitflow]]
- [[qualitat]]
- [[0010-gitflow-i-politica-de-pull-requests]]
