---
titol: "Sessió 2026-11-21 · Seguretat del codi i de les dependències (TG-362, tasques TG-383 i TG-384)"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-362", "TG-383", "TG-384", "TG-338"]
font: "US TG-362 i tasques TG-383 i TG-384 a Taiga; decisions aprovades per la persona responsable el 21/11/2026"
etiquetes: [sessio, seguretat, ci, bandit, pip-audit, pnpm-audit, defusedxml, backend, frontend]
---

# Sessió 2026-11-21 · Seguretat del codi i de les dependències (TG-362, tasques TG-383 i TG-384)

## Objectiu

Tercera tasca de TG-362 (TG-383), a la segona PR de la US. L'objectiu és que la CI del backend analitzi el codi amb bandit (criteri 4) i n'auditi les dependències de producció amb pip-audit (criteri 5), i que el job falli si troben res. També cal documentar-ho (criteri 7, la part que toca a aquesta tasca).

## Què s'ha fet

- Tests en vermell (`fa65d24`): a `tests/architecture/test_test_tooling.py`, el pas bloquejant de bandit, la configuració a `pyproject.toml`, l'auditoria del lockfile de producció contra OSV i `defusedxml` fixat com a dependència de producció. A `tests/unit/infrastructure/apod/test_nasa_feed_client.py`, el test de regressió `test_tg383_entities_of_a_dtd_are_never_expanded`.
- **Vulnerabilitat corregida** (`023f12f`): `NasaApodFeedClient` (`app/infrastructure/apod/nasa_feed_client.py`) frenava les DTD amb una regex sobre el pròleg. Posant un comentari davant de la DTD, la regex se saltava i s'expandia un «billion laughs». Ara el feed es parseja amb `defusedxml==0.7.1` (`fromstring(..., forbid_dtd=True)`): qualsevol DTD es rebutja amb `NasaApodError`. `types-defusedxml` s'ha afegit al grup `dev`, per a mypy.
- `bandit[toml]==1.9.4` i `pip-audit==2.10.1` al grup `dev` (`d24ce6a`). La configuració de bandit és a `[tool.bandit]`, sense `skips` ni `exclude_dirs` (bandit exclou per subcadena; amb `-r app` no cal), i la CI passa `--ignore-nosec` perquè només valguin les justificacions de `[tool.bandit]` (`a16c9db`, `5f96099`). Les troballes de gravetat baixa (B105 a `errors.py`, B405) es mostren però no bloquegen.
- CI (`6bc98f5`), al job `backend`, després d'import-linter i abans dels tests, dos passos bloquejants:
  - `uv run bandit -c pyproject.toml -r app -ll` (i `--ignore-nosec` des de `5f96099`);
  - `uv export --frozen --no-dev --no-emit-project` i `pip-audit -s osv --require-hashes --disable-pip`.
- Verificat en local: bandit sense troballes de gravetat mitjana o alta, i pip-audit sense vulnerabilitats conegudes.
- Documentació: [[testing]], [[seguretat]], [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] i els README del backend (ca, es, en). Cap nota del vault descrivia la comprovació amb regex. Les skills `testing-*` i `gestio-errors` no esmentaven bandit ni pip-audit, i per això no s'han tocat.

### Tasca TG-384 (criteri 6): `pnpm audit` com a avís

- Test en vermell (`22d869c`, qa-tester): `test_tg362_ci_audits_the_frontend_production_dependencies` a `tests/architecture/test_test_tooling.py` exigeix al job `frontend` un únic pas `pnpm audit --prod --audit-level=high`, just després de `pnpm install`, amb `continue-on-error: true` i una referència a TG-338.
- CI (`5b51a46`): pas «Auditoria de dependències de producció (pnpm audit, avís fins a TG-338)» al job `frontend`, just després de `pnpm install --frozen-lockfile`, amb `continue-on-error: true` i un comentari que diu que TG-338 l'ha de fer bloquejant i decidir sobre GHSA-mrhx-c7xc-m3w5.
- Verificat en local, a `frontend/`: `pnpm audit --prod --audit-level=high` surt amb codi 1 i informa de GHSA-mrhx-c7xc-m3w5 (`zod` < 4.6.6, alta, via `expo` → `@expo/cli`; 4 vulnerabilitats: 1 alta i 3 moderades). Com que el pas porta `continue-on-error`, a la CI es veurà en vermell però no farà fallar el job. `uv run pytest tests/architecture/test_test_tooling.py --no-cov` passa sencer (29 tests).
- Documentació: [[testing]], [[seguretat]], [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] i els README del frontend (ca, es, en).

## Decisions preses

Aprovades per la persona responsable en aquesta sessió:

- **La PR 2 surt de la branca de la PR 1** (`feature/TG-362-seguretat-deps` des de `feature/TG-362-robustesa-tests`).
- **`defusedxml` en lloc de `# nosec`.** La troballa de bandit sobre `xml.etree` (B314) es corregeix i no s'accepta: la regex era vulnerable de debò.
- **pip-audit contra OSV** (`-s osv`), sobre el lockfile exportat amb hashes i sense instal·lar res (`--disable-pip`).
- **`pnpm audit` com a avís fins a TG-338.** A TG-384 entra a la CI sense bloquejar. **TG-338 l'ha de passar a bloquejant**: no pot quedar oblidat.
- **GHSA-mrhx-c7xc-m3w5 (`zod`) no s'accepta a TG-384.** No va a la taula de riscos acceptats de [[seguretat]]: hi consta com a pendent de TG-338.

Decisions menors:

- `forbid_dtd=True`: un feed RSS no necessita mai una DTD.
- `types-defusedxml` al grup `dev`, perquè mypy estricte tingui els tipus.
- S'ha eliminat la regex del pròleg: `defusedxml` ja cobreix aquest cas.

## Canvis al vault

- [[testing]]: fila «Seguretat» (bandit i pip-audit instal·lats i bloquejants; `pnpm audit` a la CI com a avís des de TG-384, que TG-338 ha de fer bloquejant), avís d'estat de la implantació, ordre del job `backend` i secció nova «Seguretat estàtica i dependències (TG-362)», amb què fa cada pas, les ordres en local i com s'accepta un risc.
- [[seguretat]]: auditoria del backend a la CI, procediment per acceptar un risc i línia sobre l'XML extern amb `defusedxml`. No s'hi ha afegit cap fila de risc acceptat, perquè avui no n'hi ha cap.
- [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]]: abast amb bandit i pip-audit fets i bloquejants (TG-383); `pnpm audit` a la CI com a avís (TG-384), que TG-338 ha de fer bloquejant.
- TG-384: [[testing]] (fila «Seguretat», avís d'estat, ordre del job `frontend` i part del frontend a «Seguretat estàtica i dependències (TG-362)»), [[seguretat]] (auditoria del frontend com a avís i `zod` pendent de TG-338) i [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] (`pnpm audit` a la CI com a avís; TG-338 l'ha de fer bloquejant).

## Pendent / següents passos

- [x] TG-384: `pnpm audit` a la CI com a avís (no bloquejant).
- [ ] TG-338: passar `pnpm audit` a bloquejant (treure `continue-on-error`) i decidir sobre GHSA-mrhx-c7xc-m3w5 (`zod` via `expo` → `@expo/cli`, sense correcció dins la 3.x).
- [ ] PR cap a `develop` (després de la PR 1), revisada per una persona que no sigui l'autora, i CI verda.

## US de Taiga

- TG-362 (tasques TG-383 i TG-384)
- TG-338 (pendent: `pnpm audit` bloquejant i decisió sobre `zod`)
