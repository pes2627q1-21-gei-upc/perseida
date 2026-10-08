---
name: backend-service
description: Crea o modifica un cas d'ús (service singleton) de la capa application del backend, amb provider lru_cache i Depends. Usa-la quan calgui orquestrar ports i entitats per implementar una funcionalitat.
---

# Backend: service (cas d'ús)

Un service és un cas d'ús a `backend/app/application/<mòdul>/`: orquestra entitats del domini a través de ports, sense lògica de negoci pròpia.
Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents.

> Les plantilles són orientatives: el repo encara no té codi de backend. Versions de llibreries: versió fixada amb `uv`; pregunta/verifica.

## Quan usar-la / quan NO

- Usa-la: nou cas d'ús, orquestració entre diversos ports, transaccions, autorització del cas d'ús.
- NO: regles de negoci (van a l'entitat, `backend-entitat-domini`); definir ports (`backend-port`); implementar repositoris, routers o clients (`backend-adaptador`).
- Application depèn només de domain. No importa FastAPI, SQLModel, Redis ni httpx. El provider `@lru_cache` + `Depends` NO viu aquí: és el *composition root* i va a `infrastructure/<mòdul>/dependencies.py` (ADR-0017).

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Quin és el cas d'ús (criteri d'acceptació de la US TG-NN)? Una classe per cas d'ús o per agregat?
2. Quins ports necessita? Existeixen ja o cal crear-los (`backend-port`)?
3. Qui pot executar-lo (rol, propietari del recurs)? Quin error: `UnauthorizedError` (401) o `ForbiddenError` (403)? Recorda: l'autorització és al backend, el frontend és «tonto».
4. Transaccionalitat: quines operacions han de ser atòmiques? Hi ha UoW/sessió compartida entre ports? Cal idempotència?
5. Quins errors de domini/aplicació pot llençar i quins ports poden fallar (extern caigut: fallback o error)?
6. Hi ha efectes secundaris (notificació FCM, moderació Kev-4B, publicació Redis)? Síncrons o diferits?
7. Cal algun patró (Strategy per triar algoritme, Facade per ocultar diversos ports, Factory, Observer...)? Justifica'l; si hi ha dubte, pregunta.
8. Paginació/filtres si és una consulta: quins criteris i quin ordre?

## Passos

1. Llegeix el vault i la US; resol les preguntes amb l'humà.
2. Comprova que els ports i les entitats necessaris existeixen; si no, atura't i planifica'ls amb l'humà.
3. Escriu el service: constructor amb els ports com a dependències (tipats pel Protocol/ABC), un mètode per cas d'ús (async).
4. Flux típic: autoritza → carrega entitats via ports → invoca mètodes de negoci de l'entitat → persisteix via ports → retorna resultat. La lògica de decisió viu a l'entitat.
5. Transaccions: defineix el límit a nivell de cas d'ús (UoW o port transaccional triat amb l'humà).
6. Errors: llença `DomainError` (propagat del domini) i `ApplicationError` (`UnauthorizedError`, `ForbiddenError` a `application/shared/errors.py`). Format RFC 9457 i catàleg de codis: skill `gestio-errors`, no el dupliquis.
7. Provider singleton a `infrastructure/<mòdul>/dependencies.py` (no al service): `@lru_cache` + `Annotated[..., Depends(...)]`, que és qui coneix els adaptadors concrets. Els recursos amb cicle de vida (engine, pool Redis, client httpx) es creen al `lifespan` i s'injecten; no al service.
8. Escriu els tests (DESPRÉS del codi) amb fakes dels ports.
9. Passa `ruff`, `mypy` strict i `pytest`.

## Plantilla de codi (orientativa)

```python
# application/event/subscription_service.py  (no FastAPI imports here)
from uuid import UUID

from app.application.shared.errors import ForbiddenError
from app.domain.event.entities import EventSubscription
from app.domain.event.ports import SubscriptionRepository


class SubscriptionService:
    def __init__(self, subscriptions: SubscriptionRepository) -> None:
        self._subscriptions = subscriptions

    async def subscribe(self, user_id: UUID, event_id: UUID) -> EventSubscription:
        subscription = EventSubscription.create(user_id, event_id)  # business rules in the entity
        await self._subscriptions.add(subscription)
        return subscription

    async def cancel(self, requester_id: UUID, subscription_id: UUID) -> None:
        subscription = await self._subscriptions.get(subscription_id)  # port raises NotFoundError
        if subscription.user_id != requester_id:
            raise ForbiddenError("SUBSCRIPTION_NOT_OWNED", "not the owner")
        subscription.cancel()
        await self._subscriptions.save(subscription)
```

```python
# infrastructure/event/dependencies.py  (composition root)
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.event.subscription_service import SubscriptionService


@lru_cache
def get_subscription_service() -> SubscriptionService:
    # Concrete adapter wiring (and its lifespan resources) is decided with the human.
    return SubscriptionService(subscriptions=...)


SubscriptionServiceDep = Annotated[SubscriptionService, Depends(get_subscription_service)]
```

Notes: `ForbiddenError(code, message)` és una proposta de signatura alineada amb `DomainError`; verifica-la amb `gestio-errors`/humà. El service és singleton i **sense estat mutable per petició**.

## Tests

- Services amb **fakes** dels ports (implementacions en memòria), no mocks fràgils; sense BD ni xarxa.
- Cobreix: camí feliç; cada error (`DomainError` propagat, `ForbiddenError`, `UnauthorizedError`); fallada d'un port; transaccionalitat (no es persisteix a mitges); efectes secundaris cridats una sola vegada.
- Overrides en tests d'API: `app.dependency_overrides[get_x] = ...`.
- Cobertura application ≥ 70 % (codi nou ≥ 70 %). Nomena els tests amb la US.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; res assumit en silenci.
- [ ] Service a `application/<mòdul>/`, només depèn de domain i de ports.
- [ ] Sense lògica de negoci pròpia (a les entitats).
- [ ] Autorització explícita amb `UnauthorizedError`/`ForbiddenError`.
- [ ] Límit transaccional definit.
- [ ] Provider `@lru_cache` + `Annotated[X, Depends(get_x)]` a `infrastructure/<mòdul>/dependencies.py`; recursos al `lifespan`; `application` sense imports de FastAPI.
- [ ] Patró triat (si n'hi ha) justificat.
- [ ] Tests amb fakes escrits i verds; `ruff` i `mypy` strict nets.
- [ ] Vault actualitzat si canvia l'arquitectura o hi ha decisió rellevant.
- [ ] Cap secret ni dada personal.

## Què NO fer

- Service Locator, singleton clàssic (`__new__`/metaclasse) o estat global mutable.
- Lògica de negoci al service que hauria de ser a l'entitat.
- `HTTPException`, SQLModel, Redis o httpx dins application.
- Dependències horitzontals entre mòduls d'application llevat d'altres services/ports.
- Inventar ports, errors o versions de llibreries.
- Fer push, merge o PR; treballar fora de `feature/*`.
