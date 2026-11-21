---
titol: "Sessió 2026-11-21 · Seguretat del codi i de les dependències del backend (TG-362, tasca TG-383)"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-362", "TG-383", "TG-384", "TG-338"]
font: "US TG-362 i tasca TG-383 a Taiga; decisions aprovades per la persona responsable el 21/11/2026"
etiquetes: [sessio, seguretat, ci, bandit, pip-audit, defusedxml, backend]
---

# Sessió 2026-11-21 · Seguretat del codi i de les dependències del backend (TG-362, tasca TG-383)

## Objectiu

Tercera tasca de TG-362 (TG-383), a la segona PR de la US. L'objectiu és que la CI del backend analitzi el codi amb bandit (criteri 4) i n'auditi les dependències de producció amb pip-audit (criteri 5), i que el job falli si troben res. També cal documentar-ho (criteri 7, la part que toca a aquesta tasca).

## Què s'ha fet

- Tests en vermell (`fa65d24`): a `tests/architecture/test_test_tooling.py`, el pas bloquejant de bandit, la configuració a `pyproject.toml`, l'auditoria del lockfile de producció contra OSV i `defusedxml` fixat com a dependència de producció. A `tests/unit/infrastructure/apod/test_nasa_feed_client.py`, el test de regressió `test_tg383_entities_of_a_dtd_are_never_expanded`.
- **Vulnerabilitat corregida** (`023f12f`): `NasaApodFeedClient` (`app/infrastructure/apod/nasa_feed_client.py`) frenava les DTD amb una regex sobre el pròleg. Posant un comentari davant de la DTD, la regex se saltava i s'expandia un «billion laughs». Ara el feed es parseja amb `defusedxml==0.7.1` (`fromstring(..., forbid_dtd=True)`): qualsevol DTD es rebutja amb `NasaApodError`. `types-defusedxml` s'ha afegit al grup `dev`, per a mypy.
- `bandit[toml]==1.9.4` i `pip-audit==2.10.1` al grup `dev` (`d24ce6a`). La configuració de bandit és a `[tool.bandit]` (`exclude_dirs = ["tests"]`), sense `skips`. Les troballes de gravetat baixa (B105 a `errors.py`, B405) es mostren però no bloquegen.
- CI (`6bc98f5`), al job `backend`, després d'import-linter i abans dels tests, dos passos bloquejants:
  - `uv run bandit -c pyproject.toml -r app -ll`;
  - `uv export --frozen --no-dev --no-emit-project` i `pip-audit -s osv --require-hashes --disable-pip`.
- Verificat en local: bandit sense troballes de gravetat mitjana o alta, i pip-audit sense vulnerabilitats conegudes.
- Documentació: [[testing]], [[seguretat]], [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] i els README del backend (ca, es, en). Cap nota del vault descrivia la comprovació amb regex. Les skills `testing-*` i `gestio-errors` no esmentaven bandit ni pip-audit, i per això no s'han tocat.

## Decisions preses

Aprovades per la persona responsable en aquesta sessió:

- **La PR 2 surt de la branca de la PR 1** (`feature/TG-362-seguretat-deps` des de `feature/TG-362-robustesa-tests`).
- **`defusedxml` en lloc de `# nosec`.** La troballa de bandit sobre `xml.etree` (B314) es corregeix i no s'accepta: la regex era vulnerable de debò.
- **pip-audit contra OSV** (`-s osv`), sobre el lockfile exportat amb hashes i sense instal·lar res (`--disable-pip`).
- **`pnpm audit` com a avís fins a TG-338.** A TG-384 entra a la CI sense bloquejar. **TG-338 l'ha de passar a bloquejant**: no pot quedar oblidat.

Decisions menors:

- `forbid_dtd=True`: un feed RSS no necessita mai una DTD.
- `types-defusedxml` al grup `dev`, perquè mypy estricte tingui els tipus.
- S'ha eliminat la regex del pròleg: `defusedxml` ja cobreix aquest cas.

## Canvis al vault

- [[testing]]: fila «Seguretat» (bandit i pip-audit instal·lats; `pnpm audit` previst a TG-384), avís d'estat de la implantació, ordre del job `backend` i secció nova «Seguretat estàtica i dependències (TG-362)», amb què fa cada pas, les ordres en local i com s'accepta un risc.
- [[seguretat]]: auditoria del backend a la CI, procediment per acceptar un risc i línia sobre l'XML extern amb `defusedxml`. No s'hi ha afegit cap fila de risc acceptat, perquè avui no n'hi ha cap.
- [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]]: abast amb bandit i pip-audit fets (TG-383); `pnpm audit` continua pendent.

## Pendent / següents passos

- [ ] TG-384: `pnpm audit` a la CI com a avís (no bloquejant).
- [ ] TG-338: passar `pnpm audit` a bloquejant.
- [ ] PR cap a `develop` (després de la PR 1), revisada per una persona que no sigui l'autora, i CI verda.

## US de Taiga

- TG-362 (tasca TG-383; TG-384 pendent)
