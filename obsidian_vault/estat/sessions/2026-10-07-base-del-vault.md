---
titol: "Sessió 2026-10-07: base del vault"
tipus: sessio
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: "treball de la US TG-85 (commits de la branca)"
etiquetes: [sessio, vault, tg-85]
---

# Sessió 2026-10-07 · Base del vault

## Objectiu

Deixar el vault `obsidian_vault/` com a context compartit de l'equip i dels agents d'IA (US TG-85): estructura, convencions, arquitectura, decisions i protocol de lectura i escriptura.

## Què s'ha fet

- Skills agnòstiques a `.agents/skills/`, script de sincronització cap a `.claude/skills/` (`sync-skills.mjs`) i workflow associat.
- Skill `vault-context` i hook `SessionStart` de Claude Code (`.agents/scripts/vault-context.mjs`).
- `AGENTS.md`, `CLAUDE.md` i `GEMINI.md`.
- Estructura del vault i plantilles (`adr`, `component`, `convencio`, `sessio`).
- Convencions: [[gitflow]], [[definition-of-done]], [[qualitat]], [[testing]], [[assistents-ia]], [[actualitzacio-del-vault]], [[notes-obsidian]].
- Arquitectura i components (carpeta `arquitectura/`, vegeu [[visio-general]]).
- 15 ADR de les decisions ja preses.
- Producte ([[not-list]], [[stakeholders]], [[epiques-i-us]]), [[estat-actual]] i guies ([[llegir-el-vault-com-a-agent]], [[arrencada]]).

## Decisions preses

- [[0015-skills-agnostiques-i-vault-en-catala]]
- [[0014-context-compartit-per-a-assistents-d-ia]]

## Canvis al vault

Tot el vault és nou en aquesta US; el mapa és a [[00-index]].

## Pendent / següents passos

- [ ] `.github/pull_request_template.md` i README del vault (tasca 13 del pla).
- [ ] Ampliar les convencions de branques i commits amb TG-33 ([[gitflow]]).
- [ ] Crear l'organització de SonarQube ([[0012-sonarqube-cloud-i-quality-gate]]).
- [ ] Posar els estats a Taiga.

## US de Taiga

- TG-85

## Enllaços

- [[estat-actual]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
- [[0014-context-compartit-per-a-assistents-d-ia]]
