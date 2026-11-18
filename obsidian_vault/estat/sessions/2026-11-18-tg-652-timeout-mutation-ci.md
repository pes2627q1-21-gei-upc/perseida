---
titol: "Sessió 2026-11-18 · Timeout del mutation testing del frontend a la CI"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-652"]
font: "issue TG-652 a Taiga; execució de la CI de la PR de TG-646 cancel·lada per temps"
etiquetes: [sessio, ci, mutation, stryker, devops]
---

# Sessió 2026-11-18 · Timeout del mutation testing del frontend a la CI

## Objectiu

Evitar que el job `frontend` de la CI es cancel·li a les PR amb molts canvis. A la PR de TG-646, el pas de Stryker va arribar a uns 28 min (934 mutants, 248 supervivents, 3 timeouts). Sumat als passos previs, el job va passar dels 30 min de `timeout-minutes` i GitHub el va cancel·lar. A més, Stryker s'encallava als últims mutants perquè `timeoutMS` era 60000.

## Què s'ha fet

- Issue TG-652 (Bug, prioritat i severitat normals) creada a Taiga amb el problema i la solució.
- `.github/workflows/ci.yml`: el job `frontend` passa de `timeout-minutes: 30` a `timeout-minutes: 60`, amb el comentari actualitzat.
- `frontend/stryker.config.json`: `timeoutMS` passa de 60000 a 15000. No s'ha tocat res més.
- Skill `implementar-us` (`.agents/skills/`, sincronitzada a `.claude/skills/`): nova secció «Mida de les PR (sobretot al frontend)». Diu com estimar la mida, quan no dividir i com dividir una US en diverses PR (per subtasques de Taiga o per dependències). La plantilla del pla té una secció «Divisió en PR».
- YAML i JSON validats. No hi ha TDD: és configuració de CI i documentació, no codi de domini.

## Decisions preses

- Límit orientatiu d'uns 400 mutants de Stryker per PR de frontend (uns 12 min a la CI). Surt del ritme mesurat a TG-646: uns 33 mutants/min amb `concurrency: 4`. Ho ha demanat la persona responsable en aquesta sessió. No és cap ADR nova: és una convenció de [[gitflow]] i [[testing]], dins de [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]].

## Canvis al vault

- [[gitflow]]: criteri de mida de les PR del frontend.
- [[testing]]: `timeoutMS: 15000` i `timeout-minutes: 60` del job `frontend`, amb el motiu.

## Pendent / següents passos

- [ ] PR cap a `develop` i revisió d'una persona que no sigui l'autora.
- [ ] Comprovar a la CI d'una PR gran que el job acaba dins dels 60 min i que els mutants que pengen es tallen als 15 s.
- [ ] Ajustar el límit de 400 mutants si les dades reals de la CI ho demanen.

## US de Taiga

- TG-652
