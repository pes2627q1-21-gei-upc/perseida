---
titol: "TDD estricte i política de testing avançada"
tipus: adr
estat: acceptada
data: "2026-10-28"
us: ["TG-353"]
font: "decisió de l'equip al tancament de l'Sprint 1 (2026-10-28); Taiga TG-353 (tasques #354-#358); memòria §2.5"
etiquetes: [adr, testing, tdd, cobertura, mutation, ia]
---

# ADR-0028 · TDD estricte i política de testing avançada

> [!info] Substitueix
> Aquesta ADR substitueix [[0019-tests-despres-del-codi]] i el que quedava de TDD «només al domini» a [[0004-arquitectura-hexagonal-i-tdd-al-domini]].

## Context

Al tancament de l'Sprint 1 (2026-10-28) l'equip decideix passar de «tests després del codi» ([[0019-tests-despres-del-codi]]) a **TDD estricte a tot el backend i el frontend**, i adoptar metodologies i skills de testing més avançades. Els tests escrits després del codi tendeixen a acomodar-se a la implementació; l'ADR-0019 ho assumia com a risc i fiava la correcció a la revisió humana. Les skills i els subagents d'IA imposaven ADR-0019, així que cal que el canvi quedi documentat i reflectit a tot el context compartit.

## Decisió

Es fa TDD estricte a totes les capes del backend i del frontend: el test en vermell va en un commit `test:` **abans** del commit `feat:`/`fix:` que el fa passar, seguit del `refactor:`. A més, es fixa aquesta política:

| Àrea | Decisió |
|---|---|
| TDD | Test en vermell abans del codi, a totes les capes; commit `test:` abans de `feat:`. Cada PR inclou tests unitaris dels components modificats; un bug comença per un test de regressió |
| Cobertura | 80 % global i 90 % del codi nou; la CI de la PR falla si no es compleix |
| Mutation testing | Obligatori al domini, només sobre els fitxers canviats (mutmut al backend, Stryker al frontend), score ≥ 70 % |
| Integració | Serveis reals del docker-compose de la CI (PostgreSQL/PostGIS i Redis), `respx` i stubs/fakes propis per port per als externs |
| Piràmide | 60 % unitàries / 30 % integració / 10 % E2E (Maestro a l'app mòbil, Playwright a l'admin; només fluxos crítics) |
| Property-based | hypothesis (backend) i fast-check (frontend) a la lògica crítica del domini |
| Contracte i arquitectura | schemathesis, test d'OpenAPI sense regenerar i import-linter bloquejant |
| Frontend | `jest.mock` de hooks i client; accessibilitat amb queries per rol i lint d'a11y |
| Robustesa | pytest-randomly i pytest-xdist; quarantena dels tests inestables, sense reintents automàtics |
| Seguretat | bandit, pip-audit i `pnpm audit` |
| Migracions | upgrade -> downgrade -> upgrade |

**Abast d'aquesta ADR:** la política, la documentació i les eines d'IA (skills `testing-*`, subagents, plantilla de PR). L'automatització a la CI (llindars de cobertura bloquejants, mutmut/Stryker, schemathesis, import-linter, E2E, randomly/xdist, bandit/pip-audit/`pnpm audit`, test de migracions) **és pendent** i va a les US #359-#362 del backlog. L'ordre `test:` abans de `feat:` és una regla d'equip documentada a skills, subagents i plantilla de PR: no hi ha cap script de CI que la verifiqui; la comprova el revisor.

**Quality Gate de SonarQube Cloud:** aquesta ADR n'eleva el llindar de cobertura del codi nou del 70 % ([[0012-sonarqube-cloud-i-quality-gate]]) al 90 %, alineat amb la política. La condició es configura a SonarQube Cloud quan arribi la integració a la CI (US [#194](https://tree.taiga.io/project/alexga03-astronomia-pes/t/194)).

## Conseqüències

### Positives

- El test defineix el comportament abans del codi i no s'hi pot acomodar; l'historial de cada PR mostra el cicle red-green-refactor.
- La cobertura es complementa amb mutation testing, que detecta tests que no detecten errors.
- Més confiança als adaptadors (serveis reals) i al contracte amb el frontend (OpenAPI).
- Una sola regla per a persones i agents d'IA.

### Negatives (assumides)

- Més feina per US i commits més grans en nombre; el flux amb agents necessita un pas previ (`qa-tester` abans de `backend`/`frontend`).
- Fins que s'implantin les US #359-#362, els llindars de cobertura, el mutation testing i l'ordre dels commits depenen de la disciplina de l'equip i de la revisió humana.
- Mutation testing i E2E afegeixen temps de CI.
- Les eines noves són dependències que s'afegeixen amb `uv`/`pnpm`, versió fixada, i la persona ho aprova.

## Alternatives descartades

- Mantenir [[0019-tests-despres-del-codi]]: el risc d'acomodar els tests a la implementació es considera ara inacceptable.
- TDD estricte només al domini (proposta d'[[0004-arquitectura-hexagonal-i-tdd-al-domini]]): es decideix aplicar-lo a totes les capes.
- Verificar l'ordre `test:` abans de `feat:` amb un script de CI: descartat de moment; es documenta a skills, agents i plantilla de PR.

## US de Taiga relacionades

- TG-353 (política de testing TDD: memòria i eines d'IA)
- US #359-#362 (backlog): implantació a la CI de les eines de la política

## Enllaços

- [[testing]]
- [[definition-of-done]]
- [[gitflow]]
- [[assistents-ia]]
- [[0019-tests-despres-del-codi]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0012-sonarqube-cloud-i-quality-gate]]
