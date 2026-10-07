---
titol: Estat actual del projecte
tipus: estat
estat: vigent
data: 2026-10-07
us: ["TG-85", "TG-30", "TG-31", "TG-33", "TG-38", "TG-45", "TG-87", "TG-88"]
font: "memòria §2.1; sessió 2026-10-07; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [estat, sprint, taiga]
---

# Estat actual (2026-10-07)

Instantània a data 2026-10-07. L'estat viu a Taiga; si hi ha diferències, guanya Taiga.

## Sprint

- **Sprint 1 (5/10/2026-28/10/2026): actiu.**
- Sprint 2: 29/10-29/11/2026. Sprint 3: 30/11-18/12/2026.

## US a data 2026-10-07

| Estat | US |
|---|---|
| Done | TG-30 (estructura del monorepo i guia d'arrencada) |
| In progress | TG-85 (aquest vault) |
| Ready | TG-31, TG-33, TG-38, TG-45, TG-87, TG-88 |

La resta del backlog és a [[epiques-i-us]].

## Què ha lliurat TG-85 fins ara

- Estructura del vault, plantilles i convencions ([[definition-of-done]], [[actualitzacio-del-vault]]).
- Arquitectura i components, i 15 ADR de les decisions ja preses.
- Skills agnòstiques a `.agents/skills/` i `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`.
- Skill `vault-context` i hook `SessionStart` que injecta aquest índex i aquesta nota.
- Producte, estat i guies ([[llegir-el-vault-com-a-agent]]). Sessió: [[2026-10-07-base-del-vault]].

## Dependències

> [!note] Ordre tècnic (memòria §2.1)
> El monorepo i la CI/CD han d'existir abans que cap altra història sigui desplegable; el nucli del backend i la identitat, abans que cap funcionalitat de producte.

## Enllaços

- [[llegir-el-vault-com-a-agent]]
- [[definition-of-done]]
- [[actualitzacio-del-vault]]
- [[2026-10-07-base-del-vault]]
