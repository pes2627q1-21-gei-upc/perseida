---
titol: "SonarQube Cloud i Quality Gate obligatori a la CI"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.4.2, §2.4.5; README.md"
etiquetes: [adr, qualitat, sonarqube, ci, quality-gate]
---

# ADR-0012 · SonarQube Cloud i Quality Gate obligatori a la CI

## Context

La qualitat s'ha de construir de manera contínua i fer-se complir automàticament, amb regles homogènies per al frontend i el backend (memòria §2.4). El README indica que l'organització de SonarQube Cloud encara no s'ha creat (pendent).

## Decisió

Es decideix vincular el repositori a una organització de SonarQube Cloud (configuració pendent: encara no s'ha creat, segons el README). A cada PR cap a `develop` o `main`, el workflow de CI executa per ordre format, linters i tipus, tests amb cobertura, anàlisi de SonarQube Cloud i comprovació del Quality Gate, que fa fallar el workflow si no se supera. Després de cada fusió també s'analitzen `develop` i `main`. El Quality Gate s'aplica al codi nou de cada PR: 0 bugs i 0 vulnerabilitats noves, tots els security hotspots revisats, duplicació ≤ 3 %, cobertura ≥ 70 % i qualificació A en mantenibilitat, fiabilitat i seguretat. El token es guarda com a secret `SONAR_TOKEN`.

## Conseqüències

### Positives

- Com que la CI és obligatòria per fusionar, una PR que no supera el Quality Gate no es pot integrar.
- S'obté l'evolució històrica del projecte i mètriques (deute tècnic, code smells, duplicació, cobertura) que es revisen a cada sprint retrospective.
- Cap US pot arribar a Done sense les seves proves, perquè el Quality Gate exigeix cobertura sobre el codi nou.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-85 (vault d'Obsidian)

## Enllaços

- [[qualitat]]
- [[testing]]
- [[definition-of-done]]
- [[gitflow]]
- [[0010-gitflow-i-politica-de-pull-requests]]
- [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]
