---
name: backend-entitat-domini
description: Crea o modifica una entitat, agregat o value object de la capa domain del backend (Pydantic, invariants, multiplicitats, factory create(), DomainError). Usa-la quan calgui modelar una classe de negoci a backend/app/domain/.
---

# Backend: entitat de domini

Crea entitats riques (no dataclasses tontes) a `backend/app/domain/<mòdul>/`: validen invariants i multiplicitats i exposen mètodes de negoci.
Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents.

> Les plantilles són orientatives: el repo encara no té codi de backend. Versions de llibreries: versió fixada amb `uv`; pregunta/verifica, no les inventis.

## Quan usar-la / quan NO

- Usa-la: nova entitat/agregat/value object, nou mètode de negoci, nova regla o invariant, nous estats i transicions.
- NO: ports (`backend-port`), casos d'ús (`backend-service`), taules SQLModel, routers o clients externs (`backend-adaptador`).
- El domini no fa I/O ni importa FastAPI, SQLModel, Redis ni httpx. Només Pydantic és una llibreria externa permesa (excepció acordada).

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill (cal tenir-les respostes abans d'escriure):

1. Nom de l'entitat i mòdul. És arrel d'agregat o pertany a un altre agregat? Existeix a [model-de-domini](../../../obsidian_vault/arquitectura/model-de-domini.md)? Si no hi és o difereix, cal actualitzar el vault (DoD).
2. Atributs: nom, tipus, obligatori/opcional. Quin és l'identificador (`ID`) i qui el genera?
3. Invariants: què ha de ser sempre cert (rangs, no buit, coherència entre camps)? Quin `code` estable (SCREAMING_SNAKE) per a cada violació?
4. Multiplicitats de les relacions (p. ex. `1`, `0..1`, `0..*`, `2`). El vault avisa que algunes no són segures: si no estan clares, pregunta.
5. Té cicle de vida amb estats? Quins estats i quines transicions són legals? Cal patró State o n'hi ha prou amb un `Enum` i un mapa de transicions?
6. Emet esdeveniments de domini (p. ex. «fita desbloquejada»)? Qui els consumeix?
7. Quins atributs són value objects (immutables, sense identitat)?
8. Cal un tipus d'error propi o n'hi ha prou amb `NotFoundError`, `BusinessRuleViolation`, `ConflictError`, `ValidationError`?
9. Algun criteri d'acceptació de la US (TG-NN) que fixi regles concretes?

## Passos

1. Llegeix el vault (`vault-context`) i `model-de-domini.md`; confirma la classe i les seves relacions.
2. Resol les preguntes anteriors amb l'humà. Documenta la decisió de patró (State, Factory, Specification...) i justifica-la; si hi ha dubte, pregunta.
3. Errors: reutilitza `domain/shared/errors.py` (`DomainError(code, message)` i subclasses). El format de resposta HTTP i el catàleg de codis és a la skill `gestio-errors`; no el dupliquis aquí.
4. Escriu els value objects (`frozen=True`) i després l'entitat.
5. Valida a la construcció: `field_validator` per a camps, `model_validator` per a invariants entre camps. Les multiplicitats (mínim/màxim d'elements) es comproven al constructor i en cada mètode que afegeix o treu elements.
6. Crea l'entitat via factory `create()` (genera l'id, aplica valors inicials, valida). El constructor directe és per rehidratar des de persistència.
7. Els mètodes de negoci muten l'estat només després de comprovar les regles; si no es compleixen, llencen `DomainError`.
8. Escriu els tests unitaris (DESPRÉS del codi, sense mocks). Si l'humà prefereix TDD (ADR-0004), segueix-lo: test en vermell en un commit propi.
9. Passa `ruff`, `mypy` strict i `pytest` (`uv run ...`).

## Plantilla de codi (orientativa)

```python
# domain/shared/errors.py (already shared; see gestio-errors for the HTTP format)
class DomainError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class BusinessRuleViolation(DomainError): ...


# domain/event/value_objects.py
from pydantic import BaseModel, ConfigDict, field_validator


class Coordinates(BaseModel):
    model_config = ConfigDict(frozen=True)

    latitude: float
    longitude: float

    @field_validator("latitude")
    @classmethod
    def _check_latitude(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("latitude out of range")
        return v


# domain/event/entities.py
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, model_validator


class SubscriptionStatus(StrEnum):
    ACTIVE = "active"
    CANCELLED = "cancelled"


_ALLOWED = {SubscriptionStatus.ACTIVE: {SubscriptionStatus.CANCELLED}}


class EventSubscription(BaseModel):
    id: UUID
    user_id: UUID
    event_id: UUID
    status: SubscriptionStatus

    @classmethod
    def create(cls, user_id: UUID, event_id: UUID) -> "EventSubscription":
        return cls(id=uuid4(), user_id=user_id, event_id=event_id,
                   status=SubscriptionStatus.ACTIVE)

    def cancel(self) -> None:
        if SubscriptionStatus.CANCELLED not in _ALLOWED.get(self.status, set()):
            raise BusinessRuleViolation(
                "SUBSCRIPTION_INVALID_TRANSITION",
                f"cannot cancel from {self.status}",
            )
        self.status = SubscriptionStatus.CANCELLED
```

Notes: l'exemple és il·lustratiu (noms, `UUID` i enums són una proposta, no una decisió; confirma el tipus d'`ID` amb l'humà). Pydantic llença `ValidationError` propi: tradueix-lo a `ValidationError` de domini si la regla ha d'arribar al client amb `code` estable.

## Tests

- Unitaris del domini, **sense mocks ni I/O**, nomenats amb la US (traçabilitat criteri-prova).
- Cobreix: `create()` vàlid; cada invariant violat (comprova `code`); límits de multiplicitat (mínim, màxim, un més); cada transició legal i cada il·legal; immutabilitat dels value objects; igualtat per valor.
- Cobertura mínima del domini: ≥ 80 % (codi nou ≥ 70 %). Factories de test a `backend/tests/factories/`.

## Checklist final

- [ ] Preguntes del protocol resoltes amb l'humà; cap valor assumit en silenci.
- [ ] Entitat a `domain/<mòdul>/`, sense imports de FastAPI/SQLModel/Redis/httpx ni I/O.
- [ ] Invariants i multiplicitats validats al constructor/factory i als mètodes.
- [ ] `create()` present; mètodes de negoci comproven regles abans de mutar.
- [ ] Value objects amb `frozen=True`.
- [ ] Errors amb `DomainError` + `code` estable SCREAMING_SNAKE; sense `HTTPException`.
- [ ] Patró triat (si n'hi ha) justificat.
- [ ] Tests unitaris sense mocks escrits i verds; `ruff` i `mypy` strict nets.
- [ ] `model-de-domini.md` (i altres notes) actualitzat al vault si el model canvia, amb `obsidian-markdown`.
- [ ] Cap secret ni dada personal.

## Què NO fer

- Dataclasses tontes o entitats anèmiques amb la lògica als services.
- Importar res d'`application` o `infrastructure` des del domini; dependències horitzontals entre mòduls del domini.
- Models de taula (SQLModel) com a entitat de domini.
- `HTTPException` o missatges per a l'usuari al domini; només `code` estable.
- Inventar atributs, multiplicitats, estats o versions de llibreries.
- Fer push, merge o PR; treballar fora de `feature/*`.
