---
titol: "Sessió 2026-10-28: política de testing TDD (TG-353)"
tipus: sessio
estat: vigent
data: "2026-10-28"
us: ["TG-353"]
font: "decisió de l'equip al tancament de l'Sprint 1; Taiga TG-353 (tasques #354-#358); ADR-0028"
etiquetes: [sessio, testing, tdd, skills, agents, tg-353]
---

# Sessió 2026-10-28 · Política de testing TDD

## Objectiu

Registrar la decisió de passar de «tests després del codi» a **TDD estricte** a tot el backend i el frontend, amb una política de testing més completa, i adaptar les skills i els subagents d'IA, la plantilla de PR i el vault. La memòria (Google Doc, §2.5) i la creació de les US de CI (#359-#362) són feina a part.

## Què s'ha fet

- Quatre skills noves a `.agents/skills/`: `testing-tdd` (amb `references/patrons-per-capa.md`), `testing-integracio`, `testing-mutation` i `testing-property-based`. Les eines que no són al repo (mutmut, Stryker, hypothesis, fast-check, schemathesis, import-linter, pytest-randomly, pytest-xdist, E2E) hi són marcades com a previstes (US #359-#362).
- Skills existents (`backend-*`, `frontend-*`, `gestio-errors`, `implementar-us`): eliminat «després del codi»; `implementar-us` amb tests primer, «Qui fa què» amb `qa-tester` abans de `backend`/`frontend` i porta B amb 90 % codi nou / 80 % global.
- Subagents `qa-tester` (flux invertit: test en vermell, commit `test:`, lliurament a `backend`/`frontend`), `backend`, `frontend` i `reviewer-arquitectura` (comprova `test:` abans de `feat:`, unitaris, cobertura i mutation); fitxers natius regenerats amb `sync-agents.mjs`.
- Plantilla de PR amb secció de testing; README de `backend/` (ca, es, en) i llistes manuals (`.agents/skills/README.md`, `AGENTS.md`).

## Decisions preses

- [[0028-tdd-estricte-i-politica-de-testing-avancada]]: TDD estricte arreu, cobertura 80 % global i 90 % del codi nou, mutation ≥ 70 % al domini, piràmide 60/30/10, integració amb serveis reals, property-based, contracte, import-linter, robustesa i seguretat.
- ADR-0019 queda `substituida` (així ho indica el protocol `vault-context`) amb un callout cap a l'ADR-0028; ADR-0004 manté `acceptada` com a parcialment substituïda i en té el callout actualitzat.
- L'ordre `test:` abans de `feat:` és regla d'equip documentada a skills, subagents i plantilla de PR; no hi ha cap script de CI que el verifiqui.
- L'automatització a la CI (llindars bloquejants, mutation, schemathesis, import-linter, E2E, randomly/xdist, bandit/pip-audit/`pnpm audit`, test de migracions) **no s'ha implementat**: és pendent a les US #359-#362.

## Canvis al vault

- Nova: [[0028-tdd-estricte-i-politica-de-testing-avancada]].
- Actualitzades: [[0019-tests-despres-del-codi]], [[0004-arquitectura-hexagonal-i-tdd-al-domini]], [[testing]], [[definition-of-done]], [[gitflow]], [[assistents-ia]], [[qualitat]], [[backend-hexagonal]], [[frontend]] i [[00-index]].

## Pendent / següents passos

- [ ] Actualitzar la memòria (§2.5, §2.10) amb la nova política (la fa la persona/agent principal).
- [ ] Implantar a la CI les eines previstes (US #359-#362).
- [ ] Obrir la PR, revisió d'una persona que no sigui l'autora i fusió a `develop`.
- [ ] Revisar a la retrospectiva com funciona el flux `qa-tester` abans de `backend`/`frontend`.

## US de Taiga

- TG-353 (política de testing TDD: memòria i eines d'IA)
