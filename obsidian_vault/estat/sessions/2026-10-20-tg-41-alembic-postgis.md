---
titol: "TG-41: Alembic i PostGIS"
tipus: sessio
estat: vigent
data: "2026-10-20"
us: ["TG-41"]
font: "backend/alembic.ini, backend/alembic, backend/entrypoint.sh, backend/tests/integration/test_alembic.py, backend/README.md"
etiquetes: [sessio, backend, postgres, postgis, alembic, migracions]
---

# Sessió 2026-10-20 · Alembic i PostGIS

## Fet
- Afegida la dependència Alembic i configurada la plantilla asíncrona.
- `env.py` utilitza `DatabaseSettings` i `SQLModel.metadata`.
- `alembic.ini` no conté credencials.
- Migració inicial reversible per habilitar PostGIS, sense crear taules d'aplicació.
- `entrypoint.sh` executa `alembic upgrade head` abans d'Uvicorn i s'atura si falla.
- README actualitzat amb els comandos de migració.
- Tests: una única head i migració real amb upgrade repetit, downgrade i restauració.

## Validació
- Ruff, format i mypy correctes.
- Suite: 222 passats, 7 omesos; cobertura global 99%.
- Test específic contra PostgreSQL/PostGIS local: 2 passats.
- `git diff --check`: correcte.
- Comportament de fallada de l'entrypoint comprovat amb `uv` simulat.

## Pendent / limitacions
- No s'ha provat l'entrypoint dins d'un contenidor real: el projecte no té Dockerfile/Compose.
- Revisar el diff final abans de commit i PR.
