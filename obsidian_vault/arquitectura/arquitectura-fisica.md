---
titol: "Arquitectura física i desplegament"
tipus: arquitectura
estat: vigent
data: "2026-10-24"
us: ["TG-85", "TG-37", "TG-89", "TG-34", "TG-35", "TG-38"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6; .github/workflows/ci.yml (PR #18, PR #24); infra/docker-compose.yml (TG-37); .github/workflows/cd.yml i infra/scripts/deploy.sh (TG-38); ADR-0026 (TG-89)"
etiquetes: [arquitectura, infra, docker-compose, desplegament]
---

# Arquitectura física i desplegament

Perseida es desplega sobre **un únic servidor de Virtech** on Docker Compose orquestra **cinc contenidors**. Kubernetes es va descartar explícitament: amb un sol host físic només afegeix overhead de control plane i el punt únic de fallada continua sent el servidor ([[0002-docker-compose-en-lloc-de-kubernetes]]).

> [!note] Estat
> `infra/docker-compose.yml` i `infra/docker-compose.override.yml` ja estan implementats (US TG-37) amb els cinc serveis orquestrats, aïllament de xarxa (`internal: true` a producció i xarxa `dev` addicional només a l'override local per publicar ports de depuració) i volums persistents. La CD automàtica a Virtech per SSH (US TG-38) també hi és: vegeu «Flux de desplegament (CI/CD)».

## Diagrama

```mermaid
flowchart TB
    PHONE[Android app] -- HTTPS / WSS :40431 --> NPM
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
- **CD (implementada, TG-38)**: `.github/workflows/cd.yml` s'executa a cada push a `main` (merge de release o hotfix) i a mà des de `main`; un push o PR a `develop` o a una `feature/*` no el dispara. Tres jobs encadenats:
  1. `verify-config`: comprova que hi són tots els secrets i variables (els noms d'`infra/.env.example` més els `SSH_*`) i, si en falta algun, falla llistant-los abans de tocar el servidor.
  2. `image`: reutilitza `backend-docker.yml` (`workflow_call`) i puja a **GHCR** `perseida-api:sha-<commit>` encara que no hagi canviat cap fitxer del backend.
  3. `deploy` (entorn `production`): es connecta per **SSH** amb clau (secret de GitHub) i verificació estricta de la clau del servidor, copia `docker-compose.yml` i `infra/scripts/deploy.sh` a `/opt/perseida`, renderitza el `.env` des dels secrets i variables (`chmod 600`; viatja per stdin, mai surt als logs), fa `docker login` a GHCR amb el `GITHUB_TOKEN` temporal del job (el paquet pot continuar privat) i executa `deploy.sh <tag>`.
  - Publicar l'**APK** del frontend en una release de GitHub encara no hi és.
- **Healthcheck i rollback automàtic** ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]): `deploy.sh` fa `docker compose up -d` i espera fins a 120 s que `GET /api/health` respongui 200 amb `status: ok`. Si ho fa, desa el tag a `/opt/perseida/.deployed-tag`. Si no, atura l'API i fa una sonda amb la imatge anterior sense migracions i amb el mateix `.env`: si tampoc respon (o els noms de variable han canviat), el fallo és de configuració o d'infraestructura i no es desfà res; si respon i els noms de variable del `.env` no han canviat respecte del darrer desplegament bo (`.deployed-env`), desfà les migracions d'Alembic fins a la revisió de la imatge anterior (`alembic downgrade`, amb la imatge nova, que és la que les té), arrenca la imatge anterior, comprova el healthcheck i **el job acaba sempre en error**. El primer desplegament no té versió anterior. Els logs dels contenidors no es mostren al workflow perquè són públics.
- **Rollback manual**: `./deploy.sh --rollback sha-<commit>` al servidor, per SSH ([[api]]); fa el downgrade amb la imatge de l'últim intent fallit (`.attempted-tag`) si n'hi ha. Desfer migracions elimina les dades de les taules i columnes que havien creat, i no hi ha còpies de seguretat.
- Versionat SemVer des de `0.1.0`, una release per sprint.

## Servidor de Virtech (VM)

El «servidor» és una màquina virtual creada a mà al portal de cloud privat de la FIB (`virtech.fib.upc.edu`), no un servidor dedicat.

| Aspecte | Valor |
|---|---|
| Plantilla | Ubuntu 24.04 PES 1CPU 4GB sense VPN |
| Disc | 30 GB (`vda`), imatge no persistent; Docker Engine i Compose instal·lats; carpeta de desplegament `/opt/perseida` |
| Host públic | `nattech.fib.upc.edu` (NAT compartit; la VM és `172.16.4.43`) |
| Ports públics sense VPN | `40430`–`40439`, que apunten als ports `8080`–`8089` de la VM |

> [!warning] SSH des de fora de la UPC
> El port SSH oficial (`22043`) **no és accessible des d'Internet** sense VPN (comprovat: *timeout*). GitHub Actions s'hi connecta per un port públic NAT: `sshd` escolta també al `8089` de la VM (`/etc/ssh/sshd_config.d/10-perseida.conf`, amb `ssh.socket` desactivat) i s'hi arriba per `nattech.fib.upc.edu:40439`. Només amb clau (`PasswordAuthentication no`); la clau de desplegament és el secret `SSH_PRIVATE_KEY`. Cada membre de l'equip hi entra amb la seva clau pública, que s'afegeix amb `infra/scripts/add-team-key.sh`.

Conseqüències:

- El `8089` queda reservat a SSH; per a [[nginx-proxy-manager]] i la resta de serveis només es poden publicar els ports `8080`–`8088`. No hi ha ports 80/443 públics.

- HTTPS a producció ([[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]): [[nginx-proxy-manager]] publica el `8080` i el `8081` (des de fora, `40430` i `40431`). L'URL pública és `https://perseida.duckdns.org:40431`, amb un certificat de Let's Encrypt obtingut pel repte DNS-01 de DuckDNS. El panell d'NPM (port 81) només escolta a `127.0.0.1` i s'hi entra per túnel SSH.
- La VM s'esborra al final del quadrimestre i no té còpia de seguretat (guia del servei Virtech).
- Secrets SSH al repositori: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`. La resta de configuració del `.env` de producció (només el que usa el backend) va com a secrets i variables de GitHub.

## Entorns

Només dos: **local** (el mateix Docker Compose) i **producció** (Virtech). No hi ha staging.

## Configuració i secrets

Els secrets i variables viuen a GitHub *Secrets and variables*; el `.env` mai es versiona, només un `.env.example` sense valors.

> [!warning] Cada variable nova s'ha de donar d'alta a dos llocs
> Si el backend o el Compose necessiten una variable o un secret nous, cal afegir-lo **tant a `.env.example` com a GitHub Actions** (*Settings → Secrets and variables → Actions*; secret si és sensible, variable si no). Si falta a un dels dos, no funcionarà en producció:
>
> - Si és a `.env.example` però no a GitHub, el job `verify-config` del workflow `cd.yml` falla abans de tocar el servidor i llista les que falten. També hi comprova els `SSH_*` (`ENV_EXTRA_REQUIRED`) i que cap valor tingui un salt de línia o una cometa simple, que no es poden renderitzar.
> - Si és a GitHub però no a `.env.example`, el `.env` renderitzat no la porta, perquè `render_env.py` només escriu els noms que consten a la plantilla; la variable no arriba al servidor.
>
> Les variables que només usa un workflow (com les de Taiga) no van al servidor: es deixen fora amb `ENV_EXCLUDE` a `cd.yml`. Versions fixades: PostgreSQL 18 (+PostGIS), Redis 8 i la imatge de Kev-4B.

## Limitacions acceptades

Sense escalat horitzontal ni còpies de seguretat automàtiques; el servidor és un punt únic de fallada.

## Enllaços

- [[visio-general]], [[backend-hexagonal]], [[serveis-externs]]
- [[0002-docker-compose-en-lloc-de-kubernetes]], [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[gitflow]], [[qualitat]]
- [[testing]]
