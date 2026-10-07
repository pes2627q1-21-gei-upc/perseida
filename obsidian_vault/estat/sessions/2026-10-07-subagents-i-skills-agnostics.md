---
titol: "Sessió 2026-10-07 · Subagents i skills agnòstiques"
tipus: sessio
estat: vigent
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205)"
etiquetes: [sessio, ia, agents, skills, subagents]
---

# Sessió 2026-10-07 · Subagents i skills agnòstiques

## Objectiu

Preparar el desenvolupament àgil amb agents d'IA: subagents especialitzats i skills reutilitzables, agnòstics de l'eina, que seguin l'arquitectura i l'estètica del projecte i deleguin les decisions a la persona.

## Què s'ha fet

- US TG-205 creada a Taiga (Sprint 1, In progress, assignada a Oriol Orbea, èpica «Plataforma tècnica i monorepo»).
- Investigació dels formats natius de Claude Code, Codex, OpenCode, Copilot, Cursor, Gemini CLI i Antigravity a la documentació oficial.
- Generador `.agents/scripts/sync-agents.mjs` (amb tests) i ampliació del workflow `skills-sync-check`.
- Cinc subagents a `.agents/agents/` i els fitxers generats per eina.
- Onze skills pròpies (`backend-*`, `frontend-*`, `gestio-errors`) i vendorització de `ui-ux-pro-max` i `frontend-design`.
- `AGENTS.md` i `CLAUDE.md` actualitzats.

## Decisions preses

- [[0016-ports-i-entitats-riques-al-domini]]
- [[0017-injeccio-de-dependencies-i-services-singleton]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[0019-tests-despres-del-codi]]
- [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]
- [[0021-subagents-agnostics-i-generador]]

## Canvis al vault

- Sis ADR noves (`proposada`) i avís a [[0004-arquitectura-hexagonal-i-tdd-al-domini]] i [[0015-skills-agnostiques-i-vault-en-catala]].
- Actualitzats [[backend-hexagonal]], [[frontend]], [[testing]], [[assistents-ia]] i [[00-index]].

## Pendent / següents passos

- [ ] Posar els story points de TG-205 a Taiga (el MCP no ho permet; proposta: Back 2, Front 2, UX 1) i comprovar-ne l'èpica.
- [ ] L'equip ha d'acceptar les ADR 0016–0021, sobretot [[0019-tests-despres-del-codi]] (supera part d'ADR-0004).
- [ ] Validar amb la persona la paleta i la tipografia de «Frutiger Cosmo» abans del primer component.
- [ ] Revisar els valors orientatius de `gestio-errors` (codi `INTERNAL_ERROR`, capçalera de correlació, mapatge de status).
- [ ] Provar els subagents en cada eina i revisar les eines de `read-only` de Gemini i Copilot.

## US de Taiga

- TG-205
