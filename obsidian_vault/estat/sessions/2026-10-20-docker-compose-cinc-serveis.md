---
titol: "Sessió 2026-10-20: Docker Compose amb els cinc serveis per a local i producció"
tipus: sessio
estat: vigent
data: 2026-10-20
us: ["TG-37"]
font: "tasques TG-295 a TG-303 de la US TG-37 (branca feature/TG-37-docker-compose)"
etiquetes: [sessio, devops, infra, docker-compose, postgres, redis, nginx-proxy-manager, tg-37]
---

# Sessió 2026-10-20 · Docker Compose amb els cinc serveis (TG-37)

## Objectiu

Implementar una configuració unificada i modular de Docker Compose que orquestri els cinc serveis del sistema (`reverse-proxy`, `api`, `db`, `cache` i `moderation`) tant per al desenvolupament local com per al servidor de producció de Virtech, garantint paritat entre entorns, aïllament de xarxa i persistència de dades (US TG-37).

## Què s'ha fet

- **Estructura base i override (`infra/docker-compose.yml` i `infra/docker-compose.override.yml`)**:
  - `docker-compose.yml`: definició base per a producció amb imatge de GHCR (`ghcr.io/pes2627q1-21-gei-upc/perseida-api:${API_IMAGE_TAG:-latest}`), xarxes aïllades i sense ports interns exposats al host.
  - `docker-compose.override.yml`: modificador local que munta el codi font en calent (`../backend/app:/app/app`), executa Uvicorn amb `--reload` i exposa els ports de depuració (`5432`, `6379`, `8000`, `81`).
- **Serveis de dades i healthchecks (`db` i `cache`)**:
  - `db`: imatge oficial `postgis/postgis:18-3.6` amb volum persistent `pgdata:/var/lib/postgresql` (adaptat a la nova estructura de directoris de PostgreSQL 18) i healthcheck amb `pg_isready`.
  - `cache`: imatge oficial `redis:8-alpine` amb volum `redisdata:/data`, healthcheck `redis-cli ping` i variable `REDIS_URL`.
  - Àlies de xarxa `postgres` i `redis` a la xarxa `internal` per màxima interoperabilitat.
- **Proxy invers i moderació (`reverse-proxy` i `moderation`)**:
  - `reverse-proxy`: imatge `jc21/nginx-proxy-manager:2.12.3` amb ports públics `80` i `443`, volums `npm_data` i `npm_letsencrypt`, i port d'administració `81` restringit exclusivament a local.
  - `moderation`: stub basat en `nginx:1.27-alpine` amb perfil `moderation` (`profiles: ["moderation"]`) i healthcheck funcional, preparat per ser substituït a la US TG-101.
- **Aïllament de xarxa**:
  - Dues xarxes bridge: `gateway` (pública, connecta `reverse-proxy` i `api`) i `internal` (`internal: true`, aïlla completament `db`, `cache` i `moderation`).
- **Plantilla de configuració (`infra/.env.example`)**:
  - Plantilla completa amb valors segurs d'exemple, alineada amb `backend/.env.example`.
- **Verificacions reals executades (TG-301)**:
  - Arrencada en local des de zero: tots els serveis han assolit l'estat `(healthy)`.
  - Persistència: s'han inserit dades a PostgreSQL, s'ha aturat i suprimit el contenidor amb `docker compose down`, s'ha tornat a aixecar i les dades s'han mantingut intactes.
  - Aïllament: s'ha comprovat que en mode producció (`-f docker-compose.yml`) cap servei intern publica ports cap a l'exterior.
  - Salut de l'API: comprovat `GET /api/health` retornant 200 OK amb components `app` i `scheduler`.
  - Recàrrega en calent: comprovada la recàrrega automàtica d'Uvicorn en modificar fitxers de backend.

## Decisions preses

- Ús del patró d'herència de Docker Compose (`docker-compose.yml` base de producció + `docker-compose.override.yml` per a local) en lloc de fitxers duplicats.
- Adaptació del punt de muntatge de PostgreSQL 18 a `/var/lib/postgresql` (recomanació oficial de la imatge Docker 18+).
- Inclusió del port 8000 a l'override local per permetre proves directes sobre l'API i Swagger sense obligar a configurar el proxy a la màquina de desenvolupament.

## Canvis al vault

- [[arquitectura-fisica]]: actualitzat l'estat a vigent indicant la implementació d'`infra/docker-compose.yml`.
- [[nginx-proxy-manager]]: actualitzat amb la versió fixada `2.12.3`, volums i política de ports.
- Aquesta nota de sessió (`2026-10-20-docker-compose-cinc-serveis`).

## Pendent / següents passos

- [ ] Obrir PR de `feature/TG-37-docker-compose` cap a `develop`.
- [ ] Connectar les migracions d'Alembic a l'entrypoint un cop es fusioni la US TG-41.
- [ ] Desplegament automàtic a Virtech integrant aquest Compose a la US TG-38.

## US de Taiga

- TG-37 (subtasques TG-295 a TG-303)
