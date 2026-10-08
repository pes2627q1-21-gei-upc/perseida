---
titol: "Subagents agnòstics amb font única i generador per eina"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); documentació oficial de cada eina consultada el 2026-10-07"
etiquetes: [adr, ia, agents, subagents, skills]
---

# ADR-0021 · Subagents agnòstics amb font única i generador per eina

## Context

Cada eina d'IA defineix els subagents en un format propi. [[0015-skills-agnostiques-i-vault-en-catala]] ja resol les skills; cal el mateix per als subagents. Segons la documentació oficial: Codex, OpenCode, Copilot, Cursor, Gemini CLI i Antigravity llegeixen `.agents/skills/` i `AGENTS.md` (o equivalent); només Claude Code necessita la còpia de skills. Antigravity llegeix `.agents/agents/` i Cursor llegeix `.claude/agents/`. DeepSeek és un model sense format propi: s'usa dins d'aquestes eines.

## Decisió

- Font única a `.agents/agents/<nom>.md` (frontmatter `name`, `description`, `access`: `write` o `read-only`; el cos és el prompt, en català).
- L'script `.agents/scripts/sync-agents.mjs` genera els fitxers natius a `.claude/agents/`, `.codex/agents/` (TOML), `.opencode/agents/`, `.github/agents/` i `.gemini/agents/`; `--check` falla a la CI (workflow `skills-sync-check`) si divergeixen. Només esborra fitxers generats amb marca, mai fitxers escrits a mà.
- Cinc subagents: `backend`, `frontend`, `devops`, `reviewer-arquitectura` (només lectura) i `qa-tester`. No fixen model: hereten el de cada persona.
- **Protocol de dubtes** obligatori a tots els subagents i skills: no inventen res; si falta informació, s'aturen abans d'escriure codi i retornen un bloc `PREGUNTES PER A L'HUMÀ` a l'agent principal. Així funciona també a les eines on el subagent no pot preguntar a la persona (Claude Code, Gemini CLI).
- Es vendoritzen a `.agents/skills/` les skills `ui-ux-pro-max` i `frontend-design` amb versió fixada.

## Conseqüències

### Positives

- Una única font per a tots els agents; la divergència es detecta a la CI.
- Funciona igual a qualsevol eina compatible.

### Negatives (assumides)

- Els fitxers generats són versionats i s'han de regenerar; els noms d'eines de Gemini i Copilot per a `read-only` s'han de revisar si les eines canvien.
- Antigravity llegeix el format canònic directament: el camp `access` és una extensió que pot ignorar.

## Alternatives descartades

- Fitxers natius escrits a mà per eina: acaben divergint.
- Només `.agents/` sense generar fitxers natius: Claude Code, Codex, OpenCode, Copilot i Gemini no els llegirien.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[0015-skills-agnostiques-i-vault-en-catala]]
- [[0014-context-compartit-per-a-assistents-d-ia]]
- [[assistents-ia]]
- [[llegir-el-vault-com-a-agent]]
