---
titol: "Sessió 2026-10-21: Canvis de la revisió de la PR #34 (TG-37 Docker Compose)"
tipus: sessio
estat: vigent
data: 2026-10-21
us: ["TG-37"]
font: "revisió de PR #34 per Raquel Rubio a GitHub (pes2627q1-21-gei-upc/perseida/pull/34)"
etiquetes: [sessio, devops, infra, docker-compose, pr-review, tg-37]
---

# Sessió 2026-10-21 · Canvis de la revisió de la PR #34 (TG-37)

## Objectiu

Aplicar els canvis requerits a la revisió de la PR #34 (US TG-37: Docker Compose amb els cinc serveis), solventant l'exposició de ports en local degut a la xarxa `internal: true`, establint comprovació estricta de la variable `POSTGRES_PASSWORD`, i actualitzant la documentació i notes de sessió del vault.

## Què s'ha fet

- **Xarxa `dev` a `infra/docker-compose.override.yml`**:
  - Docker ignora la publicació de ports (`ports:`) de contenidors connectats exclusivament a xarxes amb `internal: true`. Per solucionar-ho en local sense alterar la configuració de producció, s'ha afegit una xarxa bridge auxiliar anomenada `dev` a l'override i s'ha associat als serveis `db` i `cache`.
  - Docker Compose fusiona les xarxes, permetent que a la màquina de desenvolupament s'exposin efectivament els ports `5432` i `6379` (permetre executar l'API o migracions d'Alembic des de fora de Docker segons preveu `backend/.env.example`), mentre que a producció (`docker-compose.yml`) els serveis continuen connectats únicament a `internal` sense exposar cap port al host.
- **Validació estricta de `POSTGRES_PASSWORD` a `infra/docker-compose.yml`**:
  - Substituït `${POSTGRES_PASSWORD:-change_me}` per `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD no definida}` tant al servei `api` com a `db`.
  - D'aquesta manera s'evita que si falta el fitxer `.env` a producció la base de dades s'inicialitzi amb la contrasenya per defecte `change_me`; en canvi, Docker Compose falla de manera immediata i explícita.
- **Correcció del vault**:
  - Actualitzada la nota de sessió anterior [[2026-10-20-docker-compose-cinc-serveis]] i [[arquitectura-fisica]] per reflectir la necessitat i comportament de la xarxa `dev` a l'override i la comprovació estricta de contrasenya.
  - Documentada la situació del CA5 (migracions automàtiques a l'inici): requereix la integració de TG-41 i T218 a `develop` per a la seva verificació completa de cap a cap, de manera que la US romandrà en estat `Ready for test` a Taiga fins que s'hagin completat aquestes dependències.

## Decisions preses

- Ús de la xarxa bridge auxiliar `dev` només a `docker-compose.override.yml` per a la publicació de ports en desenvolupament local.
- Adopció de la sintaxi de fallada explícita de Compose `${VARIABLE:?missatge}` per a secrets obligatoris (`POSTGRES_PASSWORD`).

## Canvis al vault

- [[2026-10-20-docker-compose-cinc-serveis]]: correcció sobre l'exposició de ports amb xarxa `dev` i fallada explícita de contrasenya.
- [[arquitectura-fisica]]: precisió sobre la xarxa `dev` en local vs `internal` estricte en producció.
- Aquesta nota de sessió ([[2026-10-21-revisio-pr-34-docker-compose]]).

## Pendent / següents passos

- [ ] L'usuari farà push dels canvis a la branca `feature/TG-37-docker-compose` i actualitzarà la descripció de la PR #34 reflectint l'estat del CA5.
- [ ] Verificar el CA5 de cap a cap un cop la US TG-41 i tasca T218 s'hagin integrat a `develop`.

## US de Taiga

- TG-37 (Docker Compose amb els cinc serveis)
