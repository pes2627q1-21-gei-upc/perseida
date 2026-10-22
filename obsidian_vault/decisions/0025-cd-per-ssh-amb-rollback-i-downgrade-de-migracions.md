---
titol: "CD per SSH amb rollback automàtic i downgrade de migracions"
tipus: adr
estat: proposada
data: "2026-10-22"
us: ["TG-38"]
font: "Taiga: US TG-38 (criteris d'acceptació); decisions de la persona responsable (2026-10-22) en implementar la US; .github/workflows/cd.yml i infra/scripts/deploy.sh"
etiquetes: [adr, cd, desplegament, rollback, alembic, ghcr, infra]
---

# ADR-0025 · CD per SSH amb rollback automàtic i downgrade de migracions

## Context

La US TG-38 demana que cada fusió a `main` desplegui el backend a la VM de Virtech per SSH i que, si el desplegament falla, el servei torni a la versió anterior. La imatge porta migracions d'Alembic que s'apliquen en arrencar ([[api]]): tornar només a la imatge anterior pot deixar l'esquema de la base de dades en una revisió que aquella imatge no coneix. No hi ha còpies de seguretat ([[arquitectura-fisica]]), el paquet de GHCR és privat i el workflow de la imatge només s'executava si canviava `backend/**`.

## Decisió

El CD publica la imatge `sha-<commit>` de `main` amb el mateix workflow que la CI (`workflow_call`), la desplega amb `infra/scripts/deploy.sh` i, si el healthcheck no passa en 120 s, **atura l'API, desfà les migracions amb `alembic downgrade` fins a la revisió de la imatge anterior, redesplega l'anterior i marca el job com a fallit**. La versió bona es guarda a `/opt/perseida/.deployed-tag`; el rollback manual és `deploy.sh --rollback <tag>`.

## Conseqüències

### Positives

- Sempre hi ha una imatge per al commit desplegat, i el rollback torna també l'esquema, no només el codi.
- El servidor baixa la imatge amb el `GITHUB_TOKEN` temporal del job: no cal cap secret nou ni fer el paquet públic.
- Cap secret al repositori: el `.env` es renderitza al servidor des dels secrets i variables de GitHub, amb permisos 600 i sense passar pels logs.

### Negatives (assumides)

- Desfer una migració elimina les taules i columnes que havia creat, amb les seves dades, i no hi ha còpies de seguretat. El README d'`infra/` ho avisa.
- Si el `downgrade` falla, es redesplega igualment la imatge anterior (es prefereix un servei amb un esquema possiblement desquadrat que un servei caigut) i el job falla amb un avís explícit.
- El primer desplegament no té versió anterior: només pot fallar.
- Els logs dels contenidors no es mostren al workflow, perquè són públics; s'han de llegir al servidor.

## Alternatives descartades

- **Tornar només a la imatge anterior, sense downgrade:** exigiria que cada migració fos compatible cap enrere amb la versió anterior; la persona responsable va demanar explícitament desfer les migracions.
- **Fer el paquet de GHCR públic:** continua sent possible, però no cal i exposa les imatges.
- **Un PAT de lectura com a secret per al `docker pull`:** un secret més a rotar; el `GITHUB_TOKEN` del job ja ho cobreix.
- **Publicar la imatge de `main` amb `backend-docker.yml` en paral·lel al CD:** no garanteix que `sha-<commit>` existeixi quan el CD el necessita, ni quan no canvia el backend.

## US de Taiga relacionades

- TG-38 (desplegament automàtic a Virtech per SSH amb el `.env` des dels secrets de GitHub)

## Enllaços

- [[arquitectura-fisica]]
- [[api]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]
- [[0010-gitflow-i-politica-de-pull-requests]]
