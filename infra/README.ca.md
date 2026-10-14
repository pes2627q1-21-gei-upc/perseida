# Perseida · Infraestructura

[English](README.md) | **Català** | [Español](README.es.md)

> 🚧 **En construcció.** El projecte és en fase d'incepció/primer sprint. El contingut següent descriu l'estat **previst** segons la documentació del projecte i pot canviar.

Configuració de Docker i de desplegament de **Perseida**, una aplicació multiplataforma de divulgació i seguiment de fenòmens astronòmics (projecte de PES, UPC-FIB). Defineix com s'executa tot el sistema en local i en producció.

## Visió general del desplegament

Tot s'executa en **un únic servidor proporcionat per Virtech**, orquestrat amb **Docker Compose** (Kubernetes s'ha descartat explícitament: amb un sol host físic només afegeix overhead de control plane i el punt únic de fallada continua sent el servidor).

```mermaid
flowchart TB
    PHONE[App Android] -- HTTPS 443 / WSS --> NPM
    ADMIN[Navegador admin] -- HTTPS SPA + REST --> NPM
    subgraph VIRTECH[Servidor Virtech - Docker Compose]
        NPM[nginx-proxy-manager<br/>TLS, proxy_pass, media + SPA admin]
        API[api<br/>FastAPI: REST + WebSocket + APScheduler]
        MOD[moderation<br/>Kev-4B]
        REDIS[(redis 8<br/>cache + pub/sub)]
        PG[(postgres 18 + PostGIS)]
        VOL[(volum media)]
        NPM -- proxy_pass --> API
        API -- HTTP síncron --> MOD
        API --> REDIS
        API --> PG
        API --- VOL
        NPM --- VOL
    end
    API --> NASA[NASA Open APIs]
    API --> OTHER[APIs de meteo / contaminació lumínica]
    API --> FCM[Firebase Cloud Messaging]
    PHONE -- OAuth2 + PKCE --> GOOGLE[Google Identity]
    API -- JWKS --> GOOGLE
    GHA[GitHub Actions] -- push imatge --> GHCR[GHCR]
    GHA -- SSH: render .env + compose up --> VIRTECH
    VIRTECH -- pull imatge --> GHCR
```

## Serveis (Docker Compose)

| Servei | Rol |
|---|---|
| `nginx-proxy-manager` | Punt d'entrada únic: HTTPS/TLS (certificats gestionats), proxy cap a l'API, upgrade de WebSocket, serveix els fitxers multimèdia dels usuaris des del volum compartit i el bundle estàtic del panell d'administració. |
| `api` | Imatge del backend `perseida-api:<git-sha>`. Un sol procés: REST + WebSocket + APScheduler. Executa les migracions d'Alembic a l'entrypoint abans d'arrencar. |
| `postgres` | PostgreSQL 18 + PostGIS, volum `pgdata` (font de veritat). |
| `redis` | Redis 8, cache amb TTL i pub/sub. Res essencial viu només aquí. |
| `moderation` | Servei del model Kev-4B, versió fixada, límits de recursos i healthcheck; accessible només des de la xarxa interna de Docker. |

## CI/CD (GitHub Actions)

- **CI** a cada PR cap a `develop`/`main`, amb filtres per ruta i cache de dependències `uv`/`pnpm`: format, linters i tipus → tests amb cobertura → SonarQube Cloud → Quality Gate. Obligatori per fusionar.
- **CD** a cada push a `main` (fusió de release o hotfix):
  1. Construeix la imatge del backend, l'etiqueta amb el `git-sha` i la puja a **GHCR**.
  2. Es connecta al servidor de Virtech per **SSH**, renderitza el `.env` des dels secrets de GitHub (`chmod 600`) i executa `docker compose up`.
  3. Publica l'**APK** del frontend en una release de GitHub.
- Versionat: SemVer a partir de `0.1.0`, una release per sprint, automatitzat pel pipeline.
- Rollback: redesplegar la imatge anterior pel seu `git-sha`.
- El repositori també conté una automatització que desbloqueja tasques de Taiga (`.github/workflows/taiga-unblock.yml`).

## GHCR — Permisos i visibilitat del paquet

La imatge del backend es publica a **GitHub Container Registry** (`ghcr.io`) sota el namespace de l'organització:

```
ghcr.io/pes2627q1-21-gei-upc/perseida-api:<tag>
```

### Permisos automàtics (GITHUB_TOKEN)

El workflow de CI/CD utilitza el token natiu `GITHUB_TOKEN` — sense necessitat de PAT ni secrets manuals:

| Àmbit | Motiu |
|---|---|
| `contents: read` | Clonar el repositori al runner |
| `packages: write` | Publicar la imatge a GHCR i actualitzar-ne les metadades |

GitHub redueix automàticament els permisos de `packages` a `read` en pull requests provinents de forks externs per seguretat.

### Configuració inicial: fer el paquet públic (un sol cop, manual)

Quan la imatge es puja per primer cop, GitHub crea el paquet com a **privat** per defecte. Per a un projecte acadèmic obert, es recomana canviar-lo a **públic**:

**Opció A — Interfície web de GitHub** (recomanat):
1. Vés al repositori a GitHub.
2. Fes clic a **Packages** (a la barra lateral dreta) → `perseida-api`.
3. Fes clic a **Package settings** → **Change visibility** → **Public**.

**Opció B — API REST de GitHub** (automatitzable):
```bash
# Requereix un PAT amb permís write:packages (execució única en local)
curl -L \
  -X PATCH \
  -H "Authorization: Bearer <EL_TEU_PAT>" \
  -H "Content-Type: application/json" \
  https://api.github.com/orgs/pes2627q1-21-gei-upc/packages/container/perseida-api \
  -d '{"visibility":"public"}'
```

### Vinculació del paquet al repositori

En el primer push, GitHub vincula el paquet automàticament al repositori gràcies al fet que el nom de la imatge coincideix amb `github.repository_owner`.

## Configuració i secrets

- Els secrets i variables viuen a **Secrets and variables** de GitHub; el job de CD genera el `.env` al servidor. El `.env` **mai** es versiona; un `.env.example` sense valors fa de plantilla.
- Versions fixades: PostgreSQL 18 (+ PostGIS), Redis 8, imatge de Kev-4B.
- Només dos entorns: **local** (el mateix Docker Compose) i **producció** (Virtech). Sense staging.

## Estructura prevista

```
infra/
├── docker-compose.yml        # els cinc serveis (local i producció)
├── .env.example
├── nginx-proxy-manager/      # configuració del proxy
├── moderation/               # imatge/configuració del servei Kev-4B
└── scripts/
    └── test-backend-docker.sh # validació local i smoke test de perseida-api
```

## Validació i proves locals (imatge Docker del backend)

Per validar la construcció de la imatge, la seguretat del contenidor i l'estat funcional en local abans de pujar canvis:

```bash
# Suite completa: Hadolint + actionlint + build + seguretat + smoke test
./infra/scripts/test-backend-docker.sh

# O reutilitzant una imatge ja construïda (ex. perseida-api:local)
./infra/scripts/test-backend-docker.sh --image=perseida-api:local --skip-build
```

## Executar en local (previst)

```bash
cp .env.example .env          # omple valors locals, mai facis commit del .env
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose down
```

## Limitacions conegudes (assumides en un projecte acadèmic)

Sense escalat horitzontal ni còpies de seguretat automàtiques; el servidor és un punt únic de fallada.

## Relacionat

[Backend](../backend/README.ca.md) · [Frontend](../frontend/README.ca.md) · [Obsidian vault](../obsidian_vault/README.ca.md)

## Equip

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
