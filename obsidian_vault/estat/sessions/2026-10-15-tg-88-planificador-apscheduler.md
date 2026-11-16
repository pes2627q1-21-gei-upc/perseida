---
titol: "TG-88: planificador APScheduler"
tipus: sessio
estat: vigent
data: "2026-10-15"
us: ["TG-88"]
font: "backend/app/infrastructure/scheduler, backend/README.md, backend/tests; Taiga TG-88"
etiquetes: [sessio, backend, apscheduler, scheduler]
---

# Sessió 2026-10-15 · Planificador APScheduler

## Objectiu

Proporcionar la infraestructura de tasques periòdiques dins del procés FastAPI (TG-88). Les tasques concretes (TG-68, TG-75) queden per a les seves US. La subtasca TG-150 (dependència i variables d'entorn) ja era a `develop`.

## Què s'ha fet

- Port `JobScheduler` al domini i adaptador `ApschedulerJobScheduler` (`AsyncIOScheduler`, `max_instances=1`, `coalesce=True`, errors registrats sense aturar res).
- `SchedulerSettings` (`SCHEDULER_ENABLED`, `SCHEDULER_TIMEZONE`, UTC per defecte) i punt únic `register_jobs`.
- Arrencada i aturada al *lifespan*; component `scheduler` al healthcheck només si està activat.
- Logging JSON amb la llibreria estàndard (`app/infrastructure/logging.py`) per al log estructurat amb el nom de la tasca.
- Proves unitàries i d'integració; secció «Scheduler» als tres README del backend.

## Decisions preses

- Tasca d'exemple només als tests, sense *heartbeat* a producció (decidit per la persona).
- Planificador desactivat: el component s'omet del healthcheck (decidit per la persona).
- Logging JSON global amb stdlib, sense dependència nova (decidit per la persona).
- Override de mypy per a `apscheduler.*`: APScheduler 3.x no porta tipus.
- Revisió d'arquitectura: la persona va triar aplicar les tres troballes mitjanes (logging JSON també a uvicorn, `correlation_id` als logs, un sol `get_scheduler_settings()`) i s'hi va afegir la validació del fus horari.
- Criteri 9 (rellotge simulat): a més dels tests amb intervals curts i esdeveniments asyncio, hi ha proves unitàries amb un rellotge simulat que avança el temps sobre APScheduler (revisió de la PR 27).
- Logging JSON global: ADR [[0022-logging-json-global-amb-stdlib]] (revisió de la PR 27).
- Lifespan: l'arrencada del planificador és dins del `try/finally`, de manera que `engine.dispose()` s'executa encara que falli el registre de tasques; `shutdown()` és inofensiu si el planificador no ha arrencat.

## Canvis al vault

- [[backend-hexagonal]]: secció «Planificador».
- [[api]]: referència a TG-88 implementat, variables `SCHEDULER_*`, data i estat d'implementació.
- [[0022-logging-json-global-amb-stdlib]]: ADR nova.
- [[00-index]]: enllaç a l'ADR.

## Pendent / següents passos

- [ ] PR, revisió per una altra persona i CI/Quality Gate.
- [ ] Tancar les subtasques a Taiga i passar la US a `Done` després de la fusió.
- [ ] TG-68 i TG-75 registren les seves tasques a `register_jobs`.

## US de Taiga

- TG-88
