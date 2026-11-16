---
titol: "Sessió 2026-10-22: Verificar el servei Redis del Compose i les variables REDIS_*"
tipus: sessio
estat: vigent
data: 2026-10-22
us: ["TG-87", "TG-37", "TG-143"]
font: "tasca TG-143 de la US TG-87 (branca feature/TG-143)"
etiquetes: [sessio, devops, infra, redis, docker-compose, tg-87, tg-143]
---

# Sessió 2026-10-22 · Verificar el servei Redis del Compose (TG-143)

## Objectiu

Verificar el servei `cache` (Redis 8) que defineix TG-37 i assegurar que `REDIS_*` consten als `.env.example` amb els mateixos noms que `backend/.env.example` (criteri 1 de TG-87, pendent a la PR #29).

## Què s'ha fet

- Revisat `infra/docker-compose.yml`: `cache` és `redis:8-alpine`, amb healthcheck `redis-cli ping`, volum `redisdata`, xarxa `internal` (àlies `redis`) i sense ports al host en producció (només al `docker-compose.override.yml` local). `api` en depèn amb `service_healthy`.
- `infra/.env.example` i `backend/.env.example` ja tenen `REDIS_HOST`, `REDIS_PORT` i `CACHE_DEFAULT_TTL_SECONDS` amb els mateixos noms; només canvia l'amfitrió (`cache` contra `localhost`). El `.env.example` de l'arrel també té `REDIS_HOST` i `REDIS_PORT`; `REDIS_HOST` s'ha unificat a `cache` (nom del servei del Compose) als dos `.env.example` d'amfitrió Docker.
- Eliminada la variable `REDIS_URL` de l'entorn de `api` al Compose: el backend no la llegeix (`RedisSettings` construeix la URL de host i port) i no constava a cap `.env.example`.
- Comprovat amb Docker i un `.env` temporal (esborrat després): `cache`, `db` i `api` queden `healthy`, Redis és `8.8.1` i, des del contenidor `api`, `RedisSettings()` dona `redis://cache:6379` amb TTL 3600 i `ping()` retorna `True`.

## Decisions preses

- No s'afegeix `CACHE_DEFAULT_TTL_SECONDS` al `.env.example` de l'arrel: és la plantilla del CD i cada nom seria un secret o variable requerit; es manté opcional, com diu [[redis]].
- Es manté `redis:8-alpine` (versió major fixada, com demana la US).

## Canvis al vault

- Aquesta sessió.
- [[redis]]: estat d'implementació (servei `cache`, àlies `redis`, `REDIS_HOST=cache`).

## Pendent / següents passos

- [ ] PR cap a `develop` i revisió d'una altra persona.
- [ ] Tancar la subtasca TG-143 i, si escau, la US TG-87 a Taiga.

## US de Taiga

- TG-87 (tasca TG-143), TG-37
