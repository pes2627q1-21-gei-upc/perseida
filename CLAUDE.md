@AGENTS.md

## Claude Code

- El hook `SessionStart` (`.claude/settings.json`) injecta l'índex i l'estat del vault; igualment segueix la skill `vault-context`.
- Les skills es carreguen de `.claude/skills/` (còpia de `.agents/skills/`); no les editis directament.
- Els subagents es carreguen de `.claude/agents/` (generats des de `.agents/agents/` amb `node .agents/scripts/sync-agents.mjs`); no els editis directament.
