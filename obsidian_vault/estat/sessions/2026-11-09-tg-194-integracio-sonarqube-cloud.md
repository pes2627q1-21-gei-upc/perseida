---
titol: "Sessió 2026-11-09: integració de SonarQube Cloud i Quality Gate (TG-194)"
tipus: sessio
estat: vigent
data: "2026-11-09"
us: ["TG-194", "TG-195", "TG-196", "TG-197", "TG-198", "TG-199", "TG-200", "TG-201", "TG-202", "TG-203", "TG-204"]
font: "US TG-194 de Taiga; .github/workflows/ci.yml; sonar-project.properties; ADR-0012"
etiquetes: [sessio, qualitat, sonarqube, ci, tg-194]
---

# Sessió 2026-11-09 · Integració de SonarQube Cloud i Quality Gate (TG-194)

## Objectiu

Integrar SonarQube Cloud al pipeline de GitHub Actions per analitzar backend i frontend a cada PR cap a `develop` i `main`, aplicant el Quality Gate personalitzat i complint la Definition of Done.

## Què s'ha fet

- Resolució de la vinculació de l'organització `pes2627q1-21-gei-upc` a SonarQube Cloud sota el pla OSS (gratuït per a projectes públics amb llicència de codi obert), desbloquejant els Quality Gates personalitzats (#195).
- Configuració del secret `SONAR_TOKEN` a GitHub Secrets del repositori (#196).
- Creació de `sonar-project.properties` a l'arrel amb indexació multillenguatge (`backend/app`, `frontend/src`), exclusió de components visuals i rutes, i rutes d'informes de cobertura (`coverage.xml` i `lcov.info`) (#197).
- Configuració i assignació del Quality Gate `perseida` a SonarQube Cloud amb llindar de cobertura ≥ 70%, duplicació ≤ 3% i nota A en bugs/seguretat/mantenibilitat (#198).
- Afegit el job `sonar` a `.github/workflows/ci.yml` descarregant els artifacts `backend-coverage` (#199) i `frontend-coverage` (#200) amb tolerància per a PRs amb canvis només a una part del repo (`continue-on-error: true`).
- Execució de l'escàner `SonarSource/sonarqube-scan-action@v8.4.1` amb `-Dsonar.qualitygate.wait=true` (#201).
- Resolució de la review de la PR #79 (Xavier Pascual i Raquel Rubio):
  - Ajustat el Quality Gate i la documentació a cobertura ≥ 90 % en codi nou (ADR-0028).
  - Eliminat `frontend/src/app/**` de `sonar.coverage.exclusions` (només s'exclou `frontend/src/shared/ui/**`).
  - Eliminat `continue-on-error: true` a les descàrregues del job `sonar` i afegit `if-no-files-found: error` a l'upload del backend.
  - Reversió de `relative_files = true` a `backend/pyproject.toml` (provocava errors de resolució de 93 fitxers a SonarCloud pel fet de truncar les rutes a basenames) i correcció de la documentació a [[qualitat]].
  - Eliminades les notes de sessions d'altres US que s'havien commitejat per error a la branca de TG-194.
  - Actualitzats els enllaços de SonarQube Cloud als READMEs del monorepo.

## Decisions preses

- **Pla OSS vs Free:** El pla Free estàndard bloquejava el Quality Gate a *Sonar way* (80% rígid) i només permetia PRs cap a la branca principal. Amb el professor s'ha configurat el pla OSS que desbloqueja el Quality Gate propi (`perseida`) i l'anàlisi completa de branques i PRs.
- **Tolerància d'artifacts:** Per evitar que el job `sonar` falli quan una PR no toca una de les dues carpetes (backend o frontend), la descàrrega d'artifacts depèn de les condicions `if` de canvis detectats (retirant `continue-on-error` per evitar que silencii errors inesperats en branques d'integració).

## Canvis al vault

- [[qualitat]]: secció de SonarQube Cloud actualitzada d'objectiu a implementada, guia de panell i línies no cobertes.
- [[0012-sonarqube-cloud-i-quality-gate]]: actualitzat l'estat del monorepo i organització.
- Aquesta sessió (`2026-11-09-tg-194-integracio-sonarqube-cloud.md`).

## Pendent / següents passos

- [x] Commits atòmics de cada tasca (#197, #199, #200, #201, #204).
- [x] Obrir la PR de la branca `feature/TG-194-sonarqube-cloud` cap a `develop` (#79).
- [x] Verificar que la CI és verda a GitHub i que el bot de SonarQube Cloud comenta la PR (#203).
- [x] Afegir els checks `backend`, `frontend` i `sonar` als rulesets de GitHub (#202).
- [ ] Aprovació final de la revisió per part d'un company (peer review) i fusió a `develop`.
