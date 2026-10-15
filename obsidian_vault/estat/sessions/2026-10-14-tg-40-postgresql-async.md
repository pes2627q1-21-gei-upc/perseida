---
titol: "TG-40: PostgreSQL async"
tipus: sessio
estat: vigent
data: "2026-10-14"
us: ["TG-40"]
font: "backend/README.md, backend/pyproject.toml, backend/tests; PR #15"
etiquetes: [sessio, backend, postgres, sqlalchemy, sqlmodel]
---

# Sessió 2026-10-14 · PostgreSQL async

## Objectiu

Implementar la infraestructura asíncrona de persistència PostgreSQL del backend, d'acord amb TG-40 i les decisions arquitectòniques vigents.

## Què s'ha fet

- Afegida la configuració de persistència amb `pydantic-settings` i construcció de la URL PostgreSQL amb `SQLAlchemy URL.create`.
- Configurada la convenció de noms de metadades de SQLModel per a restriccions i índexs.
- Implementada la dependència de sessió asíncrona amb commit en cas d'èxit i rollback si es produeix una excepció.
- Integrats la creació de l'engine i el `sessionmaker` al `lifespan` de FastAPI, amb alliberament de recursos en tancar l'aplicació.
- Fixades les versions de les dependències i actualitzat `uv.lock`.
- Afegides proves unitàries de configuració, metadades i sessions, així com proves d'integració.
- Actualitzada la documentació del backend i els README principals amb instruccions per executar PostgreSQL localment.

## Decisions preses

- Es manté l'accés asíncron mitjançant SQLModel i SQLAlchemy.
- La configuració es llegeix de variables d'entorn; no s'han de versionar secrets.
- Es mantenen les versions exactes de les dependències, d'acord amb [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]].
- PostgreSQL continua sent la font de veritat, d'acord amb [[0006-postgresql-postgis-font-de-veritat]].

## Canvis al vault

- Actualitzar [[backend-hexagonal]] per reflectir la implementació existent.
- Revisar la nota [[postgres]] perquè diferenciï PostgreSQL implementat de PostGIS i Alembic, que no queden validats per aquesta feina.

## Pendent / següents passos

- [ ] Executar les proves d'integració contra una instància real de PostgreSQL.
- [ ] Confirmar la compatibilitat amb PostGIS i les migracions Alembic en les US corresponents.
- [ ] Resoldre els comentaris de revisió de la PR #15.
- [ ] Validar els canvis finals i actualitzar l'estat de la branca abans de preparar el commit.

## US de Taiga

- TG-40
