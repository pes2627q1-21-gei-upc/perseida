---
titol: Índex del vault de Perseida
tipus: index
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: memòria i incepcions del projecte
etiquetes: [index]
---

# Índex del vault de Perseida

Memòria compartida de Perseida (PES UPC-FIB) per a agents d'IA i per als 6 membres de l'equip: arquitectura, decisions, convencions i estat.
Cada nota té frontmatter (`tipus`, `estat`, `us`, `font`); llegeix-lo abans del cos i segueix els enllaços (wikilinks).

## Per on començar (agents i persones)

1. [[visio-general]]
2. [[arquitectura-fisica]] i [[backend-hexagonal]]
3. [[definition-of-done]] i [[actualitzacio-del-vault]]
4. [[llegir-el-vault-com-a-agent]]

## Fonts de veritat

ADR acceptada > arquitectura vigent > README dels directoris. Si hi ha conflicte, guanya el vault i es corregeix el README.

## Mapa per carpetes

**arquitectura/**: [[visio-general]], [[arquitectura-fisica]], [[backend-hexagonal]], [[frontend]], [[model-de-domini]], [[serveis-externs]], [[contracte-spotwise]]

**arquitectura/components/**: [[api]], [[postgres]], [[redis]], [[nginx-proxy-manager]], [[moderation]]

**decisions/**
- [[0001-monorepo-quatre-directoris|ADR-0001 Monorepo]]
- [[0002-docker-compose-en-lloc-de-kubernetes|ADR-0002 Docker Compose]]
- [[0003-un-sol-proces-fastapi|ADR-0003 Un sol procés FastAPI]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini|ADR-0004 Hexagonal i TDD]]
- [[0005-redis-nomes-com-a-cache-lazy|ADR-0005 Redis cache lazy]]
- [[0006-postgresql-postgis-font-de-veritat|ADR-0006 PostgreSQL/PostGIS]]
- [[0007-moderacio-local-kev-4b-sincrona|ADR-0007 Moderació local]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia|ADR-0008 Google OAuth2 PKCE]]
- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin|ADR-0009 Nginx Proxy Manager]]
- [[0010-gitflow-i-politica-de-pull-requests|ADR-0010 Gitflow i PR]]
- [[0011-client-offline-sqlite-last-write-wins|ADR-0011 Client offline]]
- [[0012-sonarqube-cloud-i-quality-gate|ADR-0012 SonarQube Cloud]]
- [[0013-uv-i-pnpm-com-a-gestors-de-dependencies|ADR-0013 uv i pnpm]]
- [[0014-context-compartit-per-a-assistents-d-ia|ADR-0014 Context compartit IA]]
- [[0015-skills-agnostiques-i-vault-en-catala|ADR-0015 Skills i vault en català]]
- [[0016-ports-i-entitats-riques-al-domini|ADR-0016 Ports i entitats riques al domini]]
- [[0017-injeccio-de-dependencies-i-services-singleton|ADR-0017 DI i services singleton]]
- [[0018-errors-rfc-9457-amb-codis-estables|ADR-0018 Errors RFC 9457]]
- [[0019-tests-despres-del-codi|ADR-0019 Tests després del codi]]
- [[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020 Frontend i Frutiger Cosmo]]
- [[0021-subagents-agnostics-i-generador|ADR-0021 Subagents agnòstics]]
- [[0022-logging-json-global-amb-stdlib|ADR-0022 Logging JSON global]]
- [[0023-convencions-del-model-de-dades|ADR-0023 Convencions del model de dades]]
- [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss|ADR-0024 Defensa contra injecció SQL i XSS]]
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025 CD per SSH amb rollback i downgrade]]
- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01|ADR-0026 Producció per ports NAT amb DuckDNS]]
- [[0027-skills-de-disseny-de-tercers-subordinades-a-frutiger-cosmo|ADR-0027 Skills de disseny de tercers]]

**convencions/**: [[gitflow]], [[definition-of-done]], [[qualitat]], [[seguretat]], [[testing]], [[assistents-ia]], [[actualitzacio-del-vault]], [[notes-obsidian]]

**producte/**: [[not-list]], [[stakeholders]], [[epiques-i-us]]

**estat/**: les sessions de treball són a `estat/sessions/` (l'estat de les US és a Taiga)

**guies/**: [[llegir-el-vault-com-a-agent]], [[arrencada]], [[skills-de-disseny-de-tercers]]

## Plantilles

A `plantilles/`: `adr`, `component`, `convencio`, `sessio`.
Per usar-les, activa el connector Plantilles d'Obsidian (carpeta `plantilles`, ja configurada) i executa «Insereix plantilla» en una nota nova.
