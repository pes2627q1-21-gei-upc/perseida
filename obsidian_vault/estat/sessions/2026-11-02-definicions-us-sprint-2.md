---
titol: "Sessió 2026-11-02 · Especificació i desglossament de les US del Sprint 2"
tipus: sessio
estat: vigent
data: "2026-11-02"
us: ["TG-101", "TG-338", "TG-359", "TG-362", "TG-385"]
font: "Taiga (Sprint 2, projecte alexga03-astronomia-pes); memòria §2.1, §2.4, §2.5, §3.4; vault de Perseida"
etiquetes: [sessio, sprint-2, taiga, especificacio, planificacio]
---

# Sessió 2026-11-02 · Especificació i desglossament de les US del Sprint 2

## Objectiu

Definir de manera formal seguint la Definition of Ready (DoR) i desglossar en subtasques tècniques amb repartiment estricte de punts i hores les 5 Historias d'Usuari assignades a Alex García (`alexga03`) que estaven en estat `New` a Taiga sense descripció completa ni subtasques desglossades.

## Què s'ha fet

- Consulta de Taiga via MCP per identificar les 5 US en estat `New`: TG-101 (16 pts), TG-338 (3 pts), TG-359 (8 pts), TG-362 (6 pts) i TG-385 (8 pts).
- Anàlisi dels patrons i criteris del Sprint 1 (per exemple la sessió `2026-10-14-planificacio-sprint-1.md`, el format BDD «Com a / vull / per a», criteris «Donat/Quan/Aleshores» i la suma exacta de Story Points per subtasca).
- Redacció completa de les 5 US a `obsidian_vault/estat/sprint-2-definicions-us.md`:
  - **TG-101** (16 pts · 32 h): microservei de moderació Kev-4B local a Docker Compose, contracte HTTP `/health` i `/evaluate`, límits de memòria/CPU i 7 subtasques.
  - **TG-338** (3 pts · 6 h): auditoria de vulnerabilitats de build del frontend (`node-forge`, `zod`, `postcss-selector-parser`, `uuid`) i 3 subtasques.
  - **TG-359** (8 pts · 16 h): llindars de cobertura bloquejants (≥80% global backend, ≥70% frontend, ≥90% nou) i mutation testing sobre el diff (`mutmut`, `Stryker`), amb 5 subtasques.
  - **TG-362** (6 pts · 12 h): proves aleatòries (`pytest-randomly`), paral·lelisme (`pytest-xdist`), quarantena de tests inestables sense reintents cecs, `bandit`, `pip-audit` i `pnpm audit`, amb 4 subtasques.
  - **TG-385** (8 pts · 16 h): navegació per pestanyes a Expo Router `src/app/(app)/_layout.tsx`, pantalles modulars de «Pròximament» amb estètica Frutiger Cosmo, pantalla de perfil d'usuari (`GET /users/me`), i18n, accessibilitat WCAG 2.2 AA i 6 subtasques.
- Total d'esforç planificat: 41 story points repartits en 25 subtasques (82 hores estimades).

## Decisions preses

- Seguir la convenció de Taiga de sumar exactament els punts de la US en la suma de les subtasques.
- Mantenir aïllat el mutation testing únicament al `git diff` de la branca per no degradar el temps d'execució de la CI.
- Deixar ranures modulars (slots) a la pantalla de Perfil per connectar-hi futures USs de gamificació (ràtxes i fites) sense redissenyar el layout.

## Canvis al vault

- Creat [[sprint-2-definicions-us]]: definició i desglossament de les 5 US.
- Creada aquesta nota de sessió a `obsidian_vault/estat/sessions/2026-11-02-definicions-us-sprint-2.md`.

## Pendent / següents passos

- [ ] Revisió humana del document i confirmació per bolcar les descripcions i subtasques a Taiga mitjançant l'MCP.
- [ ] Començar l'execució de la tasca prioritària de la primera setmana de l'sprint: TG-385 (esquelet de navegació #388).

## US de Taiga

- TG-101, TG-338, TG-359, TG-362, TG-385
