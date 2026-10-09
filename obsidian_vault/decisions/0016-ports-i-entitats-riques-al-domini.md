---
titol: "Ports i entitats riques al domini, estructura capa > mòdul i persistència eficient"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable"
etiquetes: [adr, backend, hexagonal, domini, sqlmodel]
---

# ADR-0016 · Ports i entitats riques al domini, estructura capa > mòdul i persistència eficient

## Context

[[backend-hexagonal]] situava els ports a `application` i no fixava com s'organitzen els mòduls ni com s'escriuen les entitats. Abans d'escriure el primer codi del backend cal una regla única que els agents d'IA puguin seguir (skills `backend-*`). El model de [[model-de-domini]] exigeix multiplicitats i regles que una classe de dades sense comportament no pot garantir.

## Decisió

- **Ports al `domain`**: les interfícies (`Protocol`/ABC) de repositoris, clients externs i serveis de sortida es defineixen al domini. `application` els consumeix i `infrastructure` els implementa. Les dependències només van cap endins: `infrastructure` → `application` → `domain`.
- **Estructura capa > mòdul**: `backend/app/{domain,application,infrastructure}/<mòdul>/`. Els mòduls d'una mateixa capa no s'importen entre ells; es comuniquen via ports i serveis d'`application`.
- **Entitats riques**: validen invariants i multiplicitats en construir-se (factory `create()`), tenen mètodes de negoci que comproven regles abans de mutar l'estat i llencen `DomainError` amb codi estable. Els value objects són immutables. S'usa **Pydantic** (`BaseModel`, `field_validator`, `model_validator`) i és l'**única llibreria externa permesa** al domini; cap I/O, FastAPI, SQLModel, Redis ni httpx.
- **Patrons de disseny** (Strategy, State, Facade, Factory, Repository, Observer, Adapter, Specification…) quan aportin valor; s'ha de justificar i, davant el dubte, preguntar a la persona.
- **Persistència (SQLModel async, asyncpg)**: els models de taula viuen només a `infrastructure` i es mapegen a/des de les entitats; eager loading explícit (`selectinload`/`joinedload`), sense N+1 (`lazy="raise"`); filtres, agregats, ordenació, paginació keyset i PostGIS dins la consulta; índexs declarats i justificats; es prioritza l'eficiència sobre la simplicitat de la consulta.
- Tota crida a API externa, sortida a l'exterior, endpoint exposat o WebSocket es fa a `infrastructure`.

## Conseqüències

### Positives

- El domini continua provable sense frameworks (només Pydantic) i concentra les regles de negoci.
- Els ports al domini fan que `application` i `infrastructure` depenguin d'una abstracció estable.
- Les consultes crítiques (p. ex. proximitat PostGIS ≤150 ms, vegeu [[testing]]) es dissenyen per a eficiència.

### Negatives (assumides)

- Pydantic al domini l'acobla a aquesta llibreria (excepció acordada a la regla «sense llibreries externes»).
- Cal mantenir un mapper entre models de taula i entitats.

## Alternatives descartades

- Ports a `application` (estat anterior): menys cohesió amb les regles del domini.
- Mòdul > capa (vertical slices): es va preferir capa > mòdul per coherència amb [[backend-hexagonal]].
- Entitats amb `dataclass` sense validació: no garanteixen invariants ni multiplicitats.
- Entitats i taules SQLModel unificades: acoblen el domini a la persistència.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[backend-hexagonal]]
- [[model-de-domini]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0006-postgresql-postgis-font-de-veritat]]
- [[0017-injeccio-de-dependencies-i-services-singleton]]
