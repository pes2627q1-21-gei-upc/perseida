@AGENTS.md

## Claude Code

- El hook `SessionStart` (`.claude/settings.json`) injecta l'índex i l'estat del vault; igualment segueix la skill `vault-context`.
- Les skills es carreguen de `.claude/skills/` (còpia de `.agents/skills/`); no les editis directament.
