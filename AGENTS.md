# AGENTS.md

Instruccions per als agents d'IA que treballen en aquest repositori (estàndard AGENTS.md; Claude Code el llegeix via `CLAUDE.md`).

## Projecte

Perseida és una app mòbil multiplataforma de divulgació i seguiment d'esdeveniments astronòmics (projecte PES, UPC-FIB).
Monorepo amb app i panell d'administració, backend, infraestructura i documentació del projecte.
Més context: [README.md](README.md) i [obsidian_vault/00-index.md](obsidian_vault/00-index.md).

## Regles obligatòries

1. Abans de qualsevol canvi, llegeix el vault amb la skill `vault-context` (`.agents/skills/vault-context/SKILL.md`).
2. Tot fitxer de `obsidian_vault/` es crea/edita **amb** la skill `obsidian-markdown`; `.base` amb `obsidian-bases`; `.canvas` amb `json-canvas`. Per llegir pàgines web, `defuddle`.
3. Si la US canvia l'arquitectura o pren una decisió rellevant, actualitza el vault **abans de fusionar la PR** (DoD).
4. Al final de cada sessió: entrada a `obsidian_vault/estat/sessions/` i actualitza `obsidian_vault/estat/estat-actual.md`.
5. Segueix GitFlow i la política de PR; no facis push, merge ni PR sense que ho demani la persona, que és responsable de tot el codi.
   - Branques: `main` (producció; un push hi dispara el CD), `develop` (integració, CI), `feature/*` (des de `develop`; com a màxim una US), `release/*` (la talla el Scrum Master de l'sprint des de `develop` abans de la review; només bugfixes, documentació i canvis de versió) i `hotfix/*` (des de `main`, errors urgents en producció).
   - Cap push directe a `main` ni a `develop`. PR cap a `develop`: CI verda i aprovació d'una persona que no sigui l'autora; cap a `main`: CI obligatòria, aprovació opcional.
   - Treballa sempre en `feature/*` (memòria §2.10.4). `release/*` i `hotfix/*` no els creïs ni hi treballis llevat que la persona ho demani explícitament (criteri d'aquest repo; la memòria no els preveu per als agents). No pots fusionar ni saltar-te les proteccions de les branques.
   - Qui obre la PR és responsable de tot el codi que hi porta i ha de poder explicar-lo (vegeu [assistents-ia](obsidian_vault/convencions/assistents-ia.md)).
6. Cap secret, `.env`, token o dada personal als fitxers ni al vault.
7. Verifica que les llibreries/APIs existeixen; dependències amb `uv`/`pnpm` i versió fixada.

Detall dels punts 1, 3 i 4:
- Protocol de lectura/escriptura: skill `vault-context` i [guia](obsidian_vault/guies/llegir-el-vault-com-a-agent.md).
- Definition of Done: [definition-of-done](obsidian_vault/convencions/definition-of-done.md).
- Quan i com actualitzar el vault: [actualització del vault](obsidian_vault/convencions/actualitzacio-del-vault.md).
- Estat i sessions: `obsidian_vault/estat/estat-actual.md` i `obsidian_vault/estat/sessions/`.

## Skills

```bash
node .agents/scripts/sync-skills.mjs
```

Les skills es mantenen a `.agents/skills/` (font de veritat, per a tots els agents). Claude Code llegeix `.claude/skills/`, una còpia generada i versionada: no l'editis a mà. Després de canviar `.agents/skills/`, executa `node .agents/scripts/sync-skills.mjs` i fes commit de tots dos directoris; el workflow `skills-sync-check` falla si divergeixen.

## Mapa del repo

| Directori | Contingut |
|---|---|
| `backend/` | Servei FastAPI: API REST, xat en temps real (WebSocket) i scheduler. Arquitectura hexagonal. |
| `frontend/` | App mòbil React Native + Expo i panell d'administració (React Native Web). |
| `infra/` | Docker Compose, desplegament i CI/CD (GitHub Actions). |
| `obsidian_vault/` | Documentació del projecte com a vault d'Obsidian; context compartit de l'equip i dels agents. |
| `.agents/` | Skills (`.agents/skills/`) i scripts (`.agents/scripts/`) per als agents d'IA. |

## Comandes

```bash
node --test .agents/scripts/*.test.mjs     # tests dels scripts
node .agents/scripts/sync-skills.mjs --check # verifica que .claude/skills/ està sincronitzat
```

## Context de Taiga

- Projecte: `alexga03-astronomia-pes` (https://tree.taiga.io/project/alexga03-astronomia-pes).
- Llegeix la US i els seus criteris d'acceptació abans de començar.
- Als commits i PR, referencia la US amb la forma `TG-NN` (p. ex. `TG-85`).
