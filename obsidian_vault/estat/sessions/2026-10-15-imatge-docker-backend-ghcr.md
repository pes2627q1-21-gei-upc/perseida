---
titol: "Sessió 2026-10-15: construcció i publicació de la imatge Docker del backend a GHCR"
tipus: sessio
estat: vigent
data: 2026-10-15
us: ["TG-36"]
font: "treball de les tasques T217 a T225 de la US TG-36 (branca feature/TG-36-imatge-Docker-del-backend-a-GHCR)"
etiquetes: [sessio, devops, infra, docker, ghcr, backend, tg-36]
---

# Sessió 2026-10-15 · Imatge Docker del backend i pipeline a GHCR

## Objectiu

Implementar la construcció optimitzada de la imatge de contenidor del backend (`perseida-api`) i el pipeline d'automatització a GitHub Actions per publicar els artefactes versionats i immutables al GitHub Container Registry (GHCR), facilitant el desplegament continu i rollbacks ràpids per al servidor Virtech (US TG-36).

## Què s'ha fet

- **Dockerfile multi-stage (`backend/Dockerfile`)**:
  - Etapa `builder` amb `python:3.14-slim` i `uv==0.7.19` (`WORKDIR /app`), aïllant dependències de producció (`uv sync --frozen --no-dev --no-install-project`) al virtualenv `/app/.venv`.
  - Etapa `runner` neta basada en `python:3.14-slim` que només copia `/app/.venv` i el directori `app/`.
  - Eliminació explícita de `pip` i `setuptools` de la imatge final per reduir la superfície d'atac.
  - Execució sota usuari dedicat no privilegiat `appuser` (UID/GID fix `1001`, shell `/sbin/nologin`).
  - Variables d'entorn `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1` i `PATH="/app/.venv/bin:$PATH"`.
  - Fitxer `backend/.dockerignore` per excloure `.venv`, memòria cau, tests, secrets i `.git`.
- **Pipeline de GitHub Actions (`.github/workflows/backend-docker.yml`)**:
  - Disparadors `push` i `pull_request` filtrats per rutes (`backend/**` i el workflow) i `workflow_dispatch`.
  - Control de concurrència amb cancel·lació automàtica de builds obsolets a branques de desenvolupament (mai a `main`).
  - Principi de mínim privilegi amb permisos declarats a nivell de job (`contents: read` i `packages: write`).
  - Inici de sessió automàtic a GHCR mitjançant `docker/login-action@v3` amb `GITHUB_TOKEN` (només en push/dispatch).
  - Generació dinàmica d'etiquetes OCI mitjançant `docker/metadata-action@v5` (SHA curt `sha-XXXXXXX`, branca `develop`/`main`, SemVer `vX.Y.Z`).
  - Compilació i publicació amb `docker/build-push-action@v6` emprant memòria cau de GitHub Actions (`mode=max`) per accelerar els builds posteriors.
- **Validació i proves en entorn local (`infra/scripts/test-backend-docker.sh`)**:
  - Script executable que automatitza el linting amb Hadolint (Dockerfile) i actionlint (workflow), la construcció de la imatge, auditories de seguretat (UID 1001, absència de pip/uv) i un smoke test funcional contra `/api/health` i `/api/openapi.json`.
- **Documentació tècnica**:
  - Actualitzat `infra/README.md`, `infra/README.ca.md` i `infra/README.es.md` amb la guia de configuració i visibilitat pública de GHCR i l'ús de l'script de test local.
  - Actualitzada la nota de component [[api]] i l'estat actual al vault.

## Decisions preses

- Multi-stage build amb `WORKDIR /app` al builder perquè `uv sync` resolgui directament el virtualenv a `/app/.venv` de forma nativa.
- L'script d'entrypoint per a Alembic (T218) queda posposat fins a la implementació de TG-41 (Alembic) per no introduir codi mort ni dependències no instal·lades.
- Ús de `GITHUB_TOKEN` natiu en lloc de PAT personals per complir les millors pràctiques de seguretat i rotació efímera.
- Configuració de cache `type=gha,mode=max` per aprofitar la cache de capes intermèdies de `uv sync`.

## Canvis al vault

- [[api]]: afegida traçabilitat de TG-36, detalls tècnics del contenidor i actualitzat l'estat d'implementació.
- Aquesta nota de sessió (`2026-10-15-imatge-docker-backend-ghcr`).

## Pendent / següents passos

- [ ] Obrir Pull Request de la branca `feature/TG-36-imatge-Docker-del-backend-a-GHCR` cap a `develop`.
- [ ] Connectar les migracions d'Alembic a l'entrypoint un cop s'abordi TG-41.
- [ ] Primer push a GHCR des de la CI per verificar la generació del paquet i canviar la visibilitat inicial a pública a la UI de GitHub.

## US de Taiga

- TG-36
