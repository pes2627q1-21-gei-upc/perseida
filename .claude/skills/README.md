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
| `backend-entitat-domini` | Crear entitats de domini riques (Pydantic) amb invariants i multiplicitats. |
| `backend-service` | Crear un cas d'ús (service singleton) a `application`. |
| `backend-port` | Definir un port (interfície) al `domain`. |
| `backend-adaptador` | Crear adaptadors a `infrastructure` (repositori SQLModel, client extern, router, WebSocket). |
| `estetica-frutiger-cosmo` | Direcció visual «Frutiger Cosmo · Cel viu» (tokens, receptes, cel dia/posta/nit, so i moviment, checklist); orquestra `frontend-design` i `ui-ux-pro-max`. |
| `implementar-us` | Porta una US de Taiga de cap a cap: llegeix (MCP de Taiga), pregunta, planifica en simple, espera aprovació, implementa i verifica criteris + DoD. |
| `revisar-pr` | Fa la review d'una PR d'una altra persona: CI, lint, tipus i tests, `reviewer-arquitectura` i troballes per severitat; no publica res sense confirmació. |
| `rebre-review` | Atén els comentaris d'una review rebuda: verifica cadascun contra el codi, aplica o respon amb raons, i comprova CI, lint, tipus i tests. |
| `testing-tdd` | Cicle TDD estricte (test `test:` en vermell abans del `feat:`), tests derivats dels criteris, regressió i cobertura 80 % / 90 %. |
| `testing-integracio` | Integració amb PostgreSQL/PostGIS i Redis reals, `respx`, stubs per port, temps, WebSocket, migracions i contracte OpenAPI. |
| `testing-mutation` | Mutation testing (mutmut al domini, Stryker al frontend) sobre fitxers canviats, score ≥ 70 %. Eines previstes (US #359-#362). |
| `testing-property-based` | Tests basats en propietats (hypothesis, fast-check) per a la lògica crítica del domini. Eines previstes (US #359-#362). |
| `frontend-component` | Crear components amb estètica Frutiger Cosmo i responsive. |
| `frontend-crida-api` | Fer crides a l'API seguint el contracte OpenAPI. |
| `frontend-pagina` | Crear pàgines (Expo Router) per a l'app mòbil i el panell d'admin. |
| `frontend-formulari` | Crear formularis (react-hook-form + zod). |
| `frontend-jocs-dinamics` | Crear jocs, quiz, visualitzacions i microinteraccions. |
| `gestio-errors` | Gestió d'errors transversal (RFC 9457, codis estables, toasts). |
| `ui-ux-pro-max` | Intel·ligència de disseny UI/UX amb dades cercables (vendoritzada). |
| `frontend-design` | Criteri de disseny visual distintiu (vendoritzada). |

## Procedència

Les 6 skills de kepano (`obsidian-*`, `json-canvas`, `defuddle` i `knap`) provenen de [`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills), commit `3ccff5338ea700537839b21900aa5358a0402c98`, copiades sense modificacions. Llicència MIT, (c) 2026 Steph Ango; el text complet és a [`LICENSE-obsidian-skills`](LICENSE-obsidian-skills).

Les skills de disseny són vendoritzades:

- `ui-ux-pro-max`: [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), carpeta `.claude/skills/ui-ux-pro-max`, commit `477bcb28c9812b385cb51a4605ddf30d7b2266e2`. Llicència MIT, (c) 2024 Next Level Builder: [`LICENSE-ui-ux-pro-max`](LICENSE-ui-ux-pro-max). **Modificacions:** s'ha eliminat `scripts/tests/` i, a `SKILL.md`, s'ha substituït el prefix `${CLAUDE_PLUGIN_ROOT}/.claude/skills/` per `.agents/skills/` (i el paràgraf que ho explica) perquè funcioni a qualsevol eina. Els scripts són Python sense dependències; no fan crides de xarxa i només escriuen amb `--persist`.
- `frontend-design`: [`anthropics/skills`](https://github.com/anthropics/skills), carpeta `skills/frontend-design`, commit `683bc88e56f3e09ba94f7055977f3d3aa499f202`, sense modificacions. Llicència Apache-2.0: `frontend-design/LICENSE.txt`.

Les skills `backend-*`, `frontend-*` (excepte `frontend-design`), `testing-*`, `gestio-errors`, `estetica-frutiger-cosmo`, `implementar-us`, `revisar-pr` i `rebre-review` són pròpies del projecte (TG-205 per a les primeres; `estetica-frutiger-cosmo` i `implementar-us` vénen de la feina de millora de skills; `revisar-pr` i `rebre-review`, de TG-324; `testing-*`, de TG-353) i les complementen els subagents de `.agents/agents/` (vegeu ADR-0021 al vault).

## Com actualitzar-les

1. Tornar a copiar les carpetes de `skills/` des de l'origen (`kepano/obsidian-skills`, `ui-ux-pro-max`, `frontend-design`) a `.agents/skills/` i tornar a aplicar les modificacions indicades.
2. Actualitzar el commit indicat a l'apartat de procedència d'aquest README.
3. Executar `node .agents/scripts/sync-skills.mjs`.
4. Fer commit dels canvis a `.agents/skills/` i `.claude/skills/`.
