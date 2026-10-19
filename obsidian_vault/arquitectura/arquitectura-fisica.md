---
titol: "Arquitectura física i desplegament"
tipus: arquitectura
estat: vigent
data: "2026-10-19"
us: ["TG-85", "TG-37", "TG-89", "TG-34", "TG-35"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6; .github/workflows/ci.yml (PR #18, PR #24); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [arquitectura, infra, docker-compose, desplegament]
---

# Arquitectura física i desplegament

Perseida es desplega sobre **un únic servidor de Virtech** on Docker Compose orquestra **cinc contenidors**. Kubernetes es va descartar explícitament: amb un sol host físic només afegeix overhead de control plane i el punt únic de fallada continua sent el servidor ([[0002-docker-compose-en-lloc-de-kubernetes]]).

> [!warning] Estat
> Descripció de l'estat **planificat** tret de la CI del backend, que **ja existeix** (`.github/workflows/ci.yml`, TG-34). `infra/docker-compose.yml` encara no existeix (US TG-37) i la CD tampoc.

## Diagrama

```mermaid
flowchart TB
    PHONE[Android app] -- HTTPS 443 / WSS --> NPM
    ADMIN[Admin browser] -- HTTPS SPA + REST --> NPM
    subgraph VIRTECH[Virtech server - Docker Compose]
        NPM[nginx-proxy-manager<br/>TLS, proxy_pass, media + admin SPA]
        API[api<br/>FastAPI: REST + WebSocket + APScheduler]
        MOD[moderation<br/>Kev-4B]
        REDIS[(redis 8<br/>cache + pub/sub)]
        PG[(postgres 18 + PostGIS)]
        VOL[(media volume)]
        NPM -- proxy_pass --> API
        API -- sync HTTP --> MOD
        API --> REDIS
        API --> PG
        API --- VOL
        NPM --- VOL
    end
    API --> NASA[NASA Open APIs]
    API --> OTHER[Weather / light pollution APIs]
    API --> FCM[Firebase Cloud Messaging]
    PHONE -- OAuth2 + PKCE --> GOOGLE[Google Identity]
    API -- JWKS --> GOOGLE
    GHA[GitHub Actions] -- push image --> GHCR[GHCR]
    GHA -- SSH: render .env + compose up --> VIRTECH
    VIRTECH -- pull image --> GHCR
```

## Serveis de Compose

| Servei | Rol | Nota |
|---|---|---|
| `nginx-proxy-manager` | Únic punt d'entrada: TLS, proxy a l'API, upgrade WebSocket, serveix media i la SPA d'admin | [[nginx-proxy-manager]] |
| `api` | Imatge `perseida-api:<git-sha>`; un sol procés; Alembic a l'entrypoint | [[api]] |
| `postgres` | PostgreSQL 18 + PostGIS, volum `pgdata` (font de veritat) | [[postgres]] |
| `redis` | Redis 8, cache amb TTL i pub/sub; res essencial | [[redis]] |
| `moderation` | Servei Kev-4B; només xarxa interna de Docker | [[moderation]] |

## Flux de desplegament (CI/CD)

- **CI del backend (implementada, TG-34)**: el workflow `.github/workflows/ci.yml` s'executa a cada PR i a cada push cap a `develop`/`main`. Té tres jobs:
  1. `changes` (`dorny/paths-filter`): detecta si ha canviat `backend/**` o el mateix workflow.
  2. `backend`: només s'executa si hi ha canvis al backend (en un push sempre). Executa `uv sync --locked`, `ruff check`, `ruff format --check`, `mypy` i `pytest` amb cobertura. PostgreSQL (PostGIS 18) i Redis 8 s'aixequen com a *service containers* amb *healthcheck*. Publica l'informe com a artefacte `backend-coverage`. Un push nou a la mateixa PR cancel·la l'execució anterior.
  3. `frontend` (TG-35): només s'executa si ha canviat `frontend/**` o el workflow (en un push sempre). Des de `frontend/` executa `pnpm install --frozen-lockfile`, `pnpm lint` (ESLint i Prettier), `pnpm tsc` i `pnpm test --coverage --ci`. Node i pnpm fixats (Node al workflow; pnpm a `packageManager` de `frontend/package.json`) i amb memòria cau de pnpm. No necessita secrets ni *service containers*. Publica `lcov.info` com a artefacte `frontend-coverage`.
  - Les ordres per reproduir-ho en local són als README del backend i del frontend, secció "Integració contínua".
  - Quan un job s'omet perquè no han canviat els seus fitxers, compta com a superat per a un check requerit; per això el filtre és dins del workflow i no a `paths:`.
- **CI pendent**: SonarQube Cloud i comprovació del Quality Gate arribaran amb la US [#194](https://tree.taiga.io/project/alexga03-astronomia-pes/t/194). La CI és obligatòria per fusionar quan TG-33 en fixi els checks requerits (`backend` i `frontend`).
- **CD** a cada push a `main` (merge de release o hotfix):
  1. Construeix la imatge del backend, l'etiqueta amb el `git-sha` i la puja a **GHCR**.
  2. Es connecta per **SSH** al servidor de Virtech, renderitza el `.env` des dels secrets de GitHub (`chmod 600`) i executa `docker compose up`.
  3. Publica l'**APK** del frontend en una release de GitHub.
- **Rollback**: tornar a desplegar la imatge anterior pel seu `git-sha`.
- Versionat SemVer des de `0.1.0`, una release per sprint.

## Entorns

Només dos: **local** (el mateix Docker Compose) i **producció** (Virtech). No hi ha staging.

## Configuració i secrets

Els secrets i variables viuen a GitHub *Secrets and variables*; el `.env` mai es versiona, només un `.env.example` sense valors. Versions fixades: PostgreSQL 18 (+PostGIS), Redis 8 i la imatge de Kev-4B.

## Limitacions acceptades

Sense escalat horitzontal ni còpies de seguretat automàtiques; el servidor és un punt únic de fallada.

## Enllaços

- [[visio-general]], [[backend-hexagonal]], [[serveis-externs]]
- [[0002-docker-compose-en-lloc-de-kubernetes]], [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[gitflow]], [[qualitat]]
- [[testing]]
