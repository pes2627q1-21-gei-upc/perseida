# Skills d'agents (`.agents/skills/`)

Aquest directori és la **font única** de les skills dels agents del projecte. Segueix l'estàndard obert de skills ([agentskills.io](https://agentskills.io)), que l'adopten diversos agents (p. ex. Codex, OpenCode).

Claude Code llegeix les skills de `.claude/skills/`, que és una **còpia generada** d'aquest directori. Per això l'única còpia que s'edita és la d'aquí (`.agents/skills/`).

## Sincronització

Després de qualsevol canvi a `.agents/skills/`, cal regenerar la còpia de Claude Code:

```bash
node .agents/scripts/sync-skills.mjs          # copia .agents/skills -> .claude/skills
node .agents/scripts/sync-skills.mjs --check  # verifica que les còpies coincideixen
```

**No s'editen a mà** els fitxers de `.claude/skills/`: se sobreescriuen a cada sincronització.

## Skills incloses

| Skill | Funció |
| --- | --- |
| `obsidian-markdown` | Crear i editar Markdown d'Obsidian (wikilinks, embeds, callouts, propietats). |
| `obsidian-bases` | Crear i editar Obsidian Bases (fitxers `.base`) amb vistes, filtres i fórmules. |
| `json-canvas` | Crear i editar fitxers JSON Canvas (`.canvas`) amb nodes, arestes i grups. |
| `obsidian-cli` | Interactuar amb vaults d'Obsidian des de la CLI (llegir, crear, cercar notes) i dev de plugins/temes. |
| `defuddle` | Extreure Markdown net de pàgines HTML amb la CLI Defuddle. |
| `knap` | Generar Markdown a partir de plantilles i dades estructurades amb la CLI Knap. |
| `vault-context` | Protocol propi del projecte per llegir/escriure el vault (no prové de kepano). |

## Procedència

Les 6 skills de kepano (totes menys `vault-context`, que és pròpia del projecte) provenen de [`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills), commit `3ccff5338ea700537839b21900aa5358a0402c98`, copiades sense modificacions. Llicència MIT, (c) 2026 Steph Ango; el text complet és a [`LICENSE-obsidian-skills`](LICENSE-obsidian-skills).

## Com actualitzar-les

1. Tornar a copiar les carpetes de `skills/` des de l'origen (`kepano/obsidian-skills`) a `.agents/skills/`.
2. Actualitzar el commit indicat a l'apartat de procedència d'aquest README.
3. Executar `node .agents/scripts/sync-skills.mjs`.
4. Fer commit dels canvis a `.agents/skills/` i `.claude/skills/`.
