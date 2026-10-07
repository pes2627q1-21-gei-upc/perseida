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

1. [[estat-actual]]
2. [[visio-general]]
3. [[arquitectura-fisica]] i [[backend-hexagonal]]
4. [[definition-of-done]] i [[actualitzacio-del-vault]]
5. [[llegir-el-vault-com-a-agent]]

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
- [[0016-ports-i-entitats-riques-al-domini|ADR-0016 Ports i entitats riques al domini]] (proposada)
- [[0017-injeccio-de-dependencies-i-services-singleton|ADR-0017 DI i services singleton]] (proposada)
- [[0018-errors-rfc-9457-amb-codis-estables|ADR-0018 Errors RFC 9457]] (proposada)
- [[0019-tests-despres-del-codi|ADR-0019 Tests després del codi]] (proposada)
- [[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020 Frontend i Frutiger Cosmo]] (proposada)
- [[0021-subagents-agnostics-i-generador|ADR-0021 Subagents agnòstics]] (proposada)

**convencions/**: [[gitflow]], [[definition-of-done]], [[qualitat]], [[testing]], [[assistents-ia]], [[actualitzacio-del-vault]], [[notes-obsidian]]

**producte/**: [[not-list]], [[stakeholders]], [[epiques-i-us]]

**estat/**: [[estat-actual]] (les sessions són a `estat/sessions/`)

**guies/**: [[llegir-el-vault-com-a-agent]], [[arrencada]]

## Plantilles

A `plantilles/`: `adr`, `component`, `convencio`, `sessio`.
Per usar-les, activa el connector Plantilles d'Obsidian (carpeta `plantilles`, ja configurada) i executa «Insereix plantilla» en una nota nova.
