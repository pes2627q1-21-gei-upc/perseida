---
titol: Arrencada del vault i de les eines d'agents
tipus: guia
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: "AGENTS.md; .agents/scripts; configuració de .obsidian"
etiquetes: [guia, arrencada, obsidian, skills]
---

# Arrencada del vault i de les eines d'agents

Aquesta guia cobreix només el vault i les skills dels agents. L'arrencada general del repositori és al [README de l'arrel](../../README.md); no es duplica aquí.

## Obrir el vault a Obsidian

1. A Obsidian, «Obre una carpeta com a vault» i tria `obsidian_vault/`.
2. El connector Plantilles ja apunta a la carpeta `plantilles/`; usa «Insereix plantilla» en una nota nova.
3. Comença per [[00-index]].

## Skills dels agents

Després de modificar `.agents/skills/`:

```bash
node .agents/scripts/sync-skills.mjs
```

Copia les skills de `.agents/skills/` (font de veritat) a `.claude/skills/` per a Claude Code. No editis la còpia a mà; fes commit de `.agents/skills/` i `.claude/skills/` junts.

Per verificar que està sincronitzada:

```bash
node .agents/scripts/sync-skills.mjs --check
```

## Tests dels scripts

```bash
node --test .agents/scripts/*.test.mjs
```

## Enllaços

- [[llegir-el-vault-com-a-agent]]
- [[assistents-ia]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
