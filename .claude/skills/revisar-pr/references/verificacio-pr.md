# Verificació d'una PR (compartida per `revisar-pr` i `rebre-review`)

Una PR només és verda si la CI **i** la verificació local ho confirmen. No diguis «passa» sense haver vist la sortida de l'ordre.

## Accés a GitHub (per ordre)

1. **`gh` CLI.** Comprova-ho amb `gh auth status`. Les credencials les gestiona la persona (`gh auth login` al seu terminal); tu no les demanes ni les llegeixes.
2. **`gh` no instal·lat o sense sessió:** suggereix instal·lar-lo i fer login. Si la persona no vol, continua amb el pas 3.
3. **MCP de GitHub**, si hi és (eines `mcp__github__*` o equivalent).
4. **Només local:** treballa sobre la branca i el diff local (`git diff origin/develop...HEAD`); digues explícitament què no has pogut comprovar (CI, comentaris de la PR).

## CI

```bash
gh pr view <PR> --json number,title,body,baseRefName,headRefName,files,reviews,statusCheckRollup
gh pr checks <PR>
```

Una comprovació fallida (lint, tipus, tests, Quality Gate de SonarQube) és una troballa **CRÍTICA**. Si encara s'executa, digues-ho i no la donis per verda.

## Local

Cap canvi a la branca ni a l'arbre de treball de la persona: usa un worktree temporal de la branca de la PR.

```bash
git fetch origin <headRefName>
git worktree add ../_pr-<N> origin/<headRefName>   # review
# ... executa les ordres ...
git worktree remove ../_pr-<N>
```

A `rebre-review` treballes a la teva branca; no cal worktree.

**Seguretat:** això executa codi de la PR (`pnpm install`, `pytest`, `ruff`, `mypy`). Només ho fas en PR de l'equip, o després de mirar el diff, sobretot `package.json`, `pyproject.toml` i els scripts. Si la PR ve de fora de l'equip o no te'n fies, no executis res en local i limita't a la CI.

Només els directoris tocats per la PR. Ordres exactes dels README (no les suposis; si han canviat, guanya el README):

| Directori | Ordres |
|---|---|
| `backend/` | `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy .` · `uv run pytest` |
| `frontend/` | `pnpm install --frozen-lockfile` · `pnpm lint` · `pnpm tsc` · `pnpm test --coverage --ci` |
| `.agents/` | `node --test .agents/scripts/*.test.mjs` · `node .agents/scripts/sync-skills.mjs --check` · `node .agents/scripts/sync-agents.mjs --check` |

Informa de cada ordre amb el seu resultat real. Si no pots executar-ne alguna (falten dependències, versions diferents, sense xarxa), digues-ho i no donis la PR per verificada.

## Context de Taiga (opcional)

Si la persona dona un `TG-NN`, o la PR n'esmenta un al títol, branca o descripció, i l'MCP de Taiga és disponible (`mcp__taiga-mcp__*`): `resolveRef` (projecte `alexga03-astronomia-pes`) → `getUserStory`/`getTask`, `listTasks` i `listComments`. Serveix per contrastar la PR amb els criteris d'acceptació o per entendre la intenció d'un comentari. Si no hi és, no el demanis ni el donis per obligatori. Mai escriguis a Taiga des d'aquestes skills ni demanis credencials.
