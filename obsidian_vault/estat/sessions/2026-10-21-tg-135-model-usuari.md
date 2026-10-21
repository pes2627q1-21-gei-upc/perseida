---
titol: "TG-135: model d'usuari i migració"
tipus: sessio
estat: vigent
data: "2026-10-21"
us: ["TG-45", "TG-135"]
font: "backend/app/domain/users, backend/app/infrastructure/users, backend/alembic, backend/tests"
etiquetes: [sessio, backend, postgres, alembic, usuaris]
---

# Sessió 2026-10-21 · Model d'usuari i migració

## Objectiu
Tasca TG-135 de la US TG-45: taula d'usuaris amb `deleted_at` i migració d'Alembic, preparada per a les US futures i com a mínim en BCNF.

## Què s'ha fet
- Entitat de domini `User` (+ enums `Role`, `Language`, `AccountStatus`).
- Taules `users` i `user_identities` (SQLModel) i migració reversible `create_users`.
- `env.py` ignora les taules d'extensions (PostGIS) a l'*autogenerate*.
- Tests unitaris del domini i d'integració de l'esquema i de la migració.

## Decisions preses
- [[0023-convencions-del-model-de-dades]]: PK UUIDv7, identitat externa en taula pròpia, `VARCHAR`+`CHECK`, soft delete amb `deleted_at`.

## Canvis al vault
- ADR-0023 nova, índex, [[model-de-domini]] (secció d'usuari).

## Pendent / següents passos
- [ ] Repositori, mapeig fila↔entitat i upsert concurrent (TG-137).
- [ ] Substituir `ProvisionalAccountGateway` de TG-44; derivar l'estat esborrat de `deleted_at`.
- [ ] Decidir si la sessió ha d'usar `users.id` en lloc de `google_sub`.

## US de Taiga
- TG-45, tasca TG-135
