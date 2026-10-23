---
titol: "Sessió 2026-10-23: connexió de l'entrypoint d'Alembic al Dockerfile (TG-36, #218)"
tipus: sessio
estat: vigent
data: "2026-10-23"
us: ["TG-36", "TG-218"]
font: "Tasca #218 i US TG-36 de Taiga; backend/Dockerfile, backend/entrypoint.sh, infra/scripts/test-backend-docker.sh"
etiquetes: [sessio, devops, docker, alembic, ghcr, tg-36, tg-218]
---

# Sessió 2026-10-23 · Connexió de l'entrypoint d'Alembic al Dockerfile (TG-36, #218)

## Objectiu

Completar la subtasca pendent #218 de la US TG-36: connectar l'script d'entrypoint `backend/entrypoint.sh` al Dockerfile multi-stage de l'API perquè executi automàticament les migracions d'Alembic en iniciar el contenidor, i verificar que el contenidor falla si la base de dades no és accessible.

## Què s'ha fet

1. **`backend/entrypoint.sh`**:
   - Adaptat per gestionar tant l'execució en entorn local amb `uv` com dins del contenidor runner (on `uv` no és present i les eines s'executen directament des del venv a `$PATH`).
   - Si la comanda a executar és `uvicorn` (o es passa sense arguments / amb flags per defecte), executa prèviament `alembic upgrade head`.
   - Si s'executa una comanda administrativa arbitrària (ex: `id -u`, `which pip`, `sh`), delega directament en `exec "$@"` sense intentar connectar a la base de dades.
   - Amb `set -eu`, qualsevol fallada de connexió a la base de dades atura immediatament el contenidor amb codi d'error abans d'iniciar el servidor.

2. **`backend/Dockerfile`**:
   - Afegida la còpia de `alembic.ini`, `alembic/` i `entrypoint.sh` a l'etapa runner.
   - Permisos d'execució garantits (`chmod +x /app/entrypoint.sh`) sota l'usuari no privilegiat `appuser` (UID 1001).
   - Definit `ENTRYPOINT ["/app/entrypoint.sh"]` i `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.

3. **`infra/scripts/test-backend-docker.sh`**:
   - Afegida la verificació explícita del requisit de la tasca #218: comprova que el contenidor surt amb error (codi 1) si la base de dades no és accessible.
   - Actualitzat el smoke test funcional complet per inicialitzar contenidors de prova aïllats en una xarxa bridge (PostGIS i Redis), executar les migracions reals d'Alembic en arrencar i verificar la resposta 200 OK a `/api/health` i `/api/openapi.json`.

## Validació

- **Hadolint**: 0 warnings, 0 errors.
- **Actionlint**: workflow `backend-docker.yml` vàlid.
- **Suite `test-backend-docker.sh`**: 6/6 passos passats amb èxit (usuari 1001, absència de pip/uv, error sense BD, migracions automàtiques i endpoints FastAPI actius).
- **Backend checks**: `ruff check`, `ruff format --check`, `mypy` (169 fitxers sense errors) i 499 tests de `pytest` passats (cobertura global 97%).

## Canvis al vault

- [[api]]: actualitzat l'estat de l'entrypoint, migracions automàtiques (#218) i opció `RUN_MIGRATIONS=false`.
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025]]: referència explícita a `RUN_MIGRATIONS=false` per a la sonda del CD.
- Aquesta nota de sessió.

## Atenció a la review de la PR #45 (oorbea)

1. **`RUN_MIGRATIONS=false` per a la sonda de rollback**: s'ha incorporat l'interruptor `RUN_MIGRATIONS` a `backend/entrypoint.sh` (actiu per defecte; si és `false`, omet les migracions). S'ha configurat a `probe_previous` de `infra/scripts/deploy.sh` (`-e RUN_MIGRATIONS=false`) per evitar que la sonda falli intentant migrar amb codi antic sobre un esquema més nou, d'acord amb la [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025]].
2. **Robustesa a `test-backend-docker.sh`**: inicialització prèvia de `CONTAINER_ID=""` i guarda `${CONTAINER_ID:-}` a la funció `cleanup` abans d'instal·lar el `trap EXIT` (evitant fallada per *unbound variable* amb `set -u`).
3. **Numeració de passos**: unificats tots els passos a `/6`.
4. **Rebase**: branca rebasejada netament sobre `develop` (incorporant la PR #40 de la TG-38).

## US de Taiga

- TG-36
- TG-218
