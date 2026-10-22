---
titol: "TG-324: skills per fer i rebre reviews de PR"
tipus: sessio
estat: vigent
data: "2026-10-21"
us: ["TG-324", "TG-205"]
font: ".agents/skills/revisar-pr, .agents/skills/rebre-review, .agents/skills/README.md, obsidian_vault/convencions/assistents-ia.md"
etiquetes: [sessio, skills, review, pr]
---

# Sessió 2026-10-21 · Skills de review de PR

## Fet
- Skill `revisar-pr`: llegeix la PR, comprova la CI i executa lint, tipus i tests en un worktree temporal, delega a `reviewer-arquitectura` i informa per severitat. No publica res sense confirmació.
- Skill `rebre-review`: verifica cada comentari contra el codi abans d'aplicar-lo o respondre'l, fa commits atòmics i comprova CI, lint, tipus i tests.
- Accés a GitHub per ordre: `gh` (suggerir instal·lar-lo) → MCP de GitHub → local. Context de Taiga opcional.
- Referència compartida: `.agents/skills/revisar-pr/references/verificacio-pr.md`.
- Actualitzats `.agents/skills/README.md` i [[assistents-ia]]. `.claude/skills/` regenerat.

## Validació
- `node .agents/scripts/sync-skills.mjs --check`: correcte.
- `node --test .agents/scripts/*.test.mjs`: 38 passats, 1 omès, 0 fallats.

## Pendent / limitacions
- Les skills no s'han provat encara amb una PR real; la primera prova real és pendent.
- La tasca #324 no tenia descripció ni criteris: els criteris es van acordar amb la persona durant la sessió.
