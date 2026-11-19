---
titol: "Sessió 2026-11-18: servei del motor de fites i connexió amb la ratxa (TG-573)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-58", "TG-573"]
font: "Taiga: US TG-58 i tasca #573; codi a backend/app/application/achievements i backend/app/application/streaks; mutation executat en local"
etiquetes: [sessio, backend, fites, gamificacio, ratxa]
---

# Sessió 2026-11-18 · Servei del motor de fites i connexió amb la ratxa (TG-573)

## Objectiu

Tancar la part interna del motor de fites de [[epiques-i-us|TG-58]]: el servei que desbloqueja fites i la connexió amb la ratxa diària, perquè arribar als dies de ratxa del catàleg (1, 7, 14, 30, 100 i 365) en desbloquegi la fita corresponent una sola vegada.

## Què s'ha fet

- **`AchievementService`** (`app/application/achievements/`): `record_activity` desbloqueja les fites d'un tipus que arriben al valor rebut i encara falten; una activitat desconeguda no fa res. `list_progress` calcula, per a cada fita, valor actual i meta (limitat a la meta; una fita desbloquejada, sempre plena).
- **Port `ActivityLog`** (`app/domain/shared/ports.py`): `StreakService.register_activity` hi avisa la ratxa actual després de registrar. `AchievementService.record` l'implementa. Si el motor falla, la ratxa es manté i només es registra un avís.
- **Cablejat** a `infrastructure/achievements/dependencies.py` i `infrastructure/streaks/dependencies.py`. El motor llegeix la ratxa amb una còpia de `StreakService` que no avisa a ningú, per no fer un cercle de dependències.
- Tests primer en vermell i després el codi, en commits separats ([[0028-tdd-estricte-i-politica-de-testing-avancada]]). Els tests antics de la ratxa s'han adaptat al nou constructor.

### Verificació local

- Suite completa amb PostgreSQL i Redis reals: 1383 tests, cobertura del 99 %. `ruff`, `mypy` i `lint-imports` nets.
- Mutation: domini de fites 100 % (25 mutants, script de la CI); `AchievementService` i `StreakService` 89,7 %, amb un mutant real matat amb un test nou. Els 7 supervivents de `register_activity` només canvien el text del missatge d'avís (equivalents).

## Decisions preses

Cap ADR nova; el port segueix [[backend-hexagonal]] (cap feature n'importa una altra).

- `ActivityLog` viu a `domain/shared` i l'activitat és un text, perquè la ratxa no depengui del motor.
- Si el motor falla en avisar-lo, la ratxa ja registrada es manté (només un avís al log). Decisió de la persona en aquesta sessió.
- La tasca TG-573 i els primers textos d'aquesta PR parlaven de «3 i 7 dies», però el catàleg de [[catalog-de-fites]] no té cap fita de 3 dies (les ratxes són d'1, 7, 14, 30, 100 i 365) i el criteri 4 de TG-58 només diu 7 dies. Decisió de la persona: es manté el catàleg (ara `vigent`) i es corregeix el text de la tasca TG-573.
- La PR es parteix en dues: TG-570 a TG-573 (motor intern) i, després, APOD i endpoint (decisió de l'equip: PR petites).

## Canvis al vault

- [[model-de-domini]]: secció «Fites (implementat)» amb els camps, el flux del motor i la connexió amb la ratxa.
- [[catalog-de-fites]]: passa d'`esborrany` a `vigent`, perquè la migració ja el carrega.

## Pendent / següents passos

- [ ] Obrir la PR del motor intern cap a `develop` (CI verda i aprovació d'una altra persona).
- [ ] Registrar l'activitat en consultar l'APOD (criteri 5 de TG-58).
- [ ] Endpoint `GET /api/users/me/achievements` amb data, progrés i meta; el port haurà de retornar les dates (criteris 7 a 9).
- [ ] Actualitzar [[api]] quan hi hagi l'endpoint.

## US de Taiga

- TG-58, tasca TG-573
