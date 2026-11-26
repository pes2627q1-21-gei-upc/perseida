---
titol: "Sessió 2026-11-26: còpia de la base de dades abans de migrar (TG-386)"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-386"]
font: "Taiga TG-386; infra/scripts/backup-db.sh, infra/scripts/deploy.sh i infra/README.md"
etiquetes: [sessio, infra, cd, backup, postgresql]
---

# Sessió 2026-11-26 · Còpia de la base de dades abans de migrar (TG-386)

## Objectiu

Que el desplegament faci una còpia de PostgreSQL abans de migrar i abans de desfer migracions, i deixar documentat com restaurar-la.

## Què s'ha fet

- **`infra/scripts/backup-db.sh`:** `pg_dump -Fc` dins del contenidor `db`, fitxer temporal verificat amb `pg_restore --list`, nom `perseida-<UTC>-<git-sha>-<revisió>.dump` i rotació de `BACKUP_KEEP` còpies (5 per defecte) només després d'una còpia bona.
- **Integració a `deploy.sh`:** còpia abans d'arrencar la imatge nova si hi ha migracions pendents (`--if-pending`, amb el `head` que calcula `head_of`; `--always` si es desconeix) i sempre abans d'un `alembic downgrade`, tant en el rollback automàtic com en `--rollback`. Si la còpia falla, no s'arrenca la imatge nova ni es desfà res.
- **Variables:** `BACKUP_KEEP` es renderitza al `.env`; `BACKUP_DIR` és opcional: es renderitza només si hi ha una variable de GitHub amb ruta absoluta (`ENV_OPTIONAL` a `cd.yml` i a `render_env.py`; review de la PR #175); sense ella l'script usa el seu valor per defecte. `deploy.sh` només carrega aquestes dues variables del `.env`. `cd.yml` copia `backup-db.sh` a `/opt/perseida/`.
- **TDD (ADR-0028):** tests en vermell abans de cada `feat:` (`d5f5582f` per a l'script, `be6f93f4` per a la integració al desplegament); els tests són a `infra/scripts/test_backup_db.py` i `infra/scripts/test_deploy_backup.py`.
- **Restauració:** provada en local amb Docker Compose (dump llegit del host per entrada estàndard, `pg_restore` al contenidor `db`): mateixes taules, mateix nombre de files i dades PostGIS intactes. Procediment al README d'`infra/` (`e2c274b8`), amb el pas d'arrencar l'API amb `API_IMAGE_TAG=<tag>`.
- **Documentació:** README d'`infra/` en català, castellà i anglès (secció de còpies, variables, avís del rollback corregit, limitacions).

## Decisions preses

- [[0035-copies-de-seguretat-de-postgresql-al-cd]]: ADR nova amb el comportament complet i les alternatives descartades.
- **`BACKUP_DIR` és opcional al render del `.env`:** GitHub no admet variables buides; sense variable, l'script usa `~/perseida/backups`. Editar el `.env` del servidor no serveix: cada desplegament el reescriu.
- **Un contenidor `db` aturat fa fallar la còpia** (`docker compose ps -aq db`); només s'omet si no n'hi ha cap.
- **Rollback manual:** la còpia es fa abans d'aturar l'API.
- **El git-sha del nom de la còpia va sense el prefix `sha-`.**
- **La restauració no és automàtica:** esborra i recrea la base de dades, així que és una decisió humana.

## Review de la PR #175

Canvis a partir de la review: `BACKUP_DIR` configurable (tests `test:` previs al `feat:`/`fix:`), còpia fallida amb `db` aturat i còpia abans d'aturar l'API al rollback manual. L'ordre TDD dels commits `6d96b691` i `e1f05646` no es reescriu (no es plega l'historial); no s'afegeix la CI d'`infra/scripts` (fora d'abast, es proposa com a subtasca).

## Canvis al vault

- Nova [[0035-copies-de-seguretat-de-postgresql-al-cd]] i entrada a [[00-index]].
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]: actualització del 2026-11-26, alternativa `pg_dump` reescrita i `TG-386` a les US relacionades; es conserva tota la informació de rollback.
- [[arquitectura-fisica]], [[postgres]], [[visio-general]], [[0002-docker-compose-en-lloc-de-kubernetes]] i [[0006-postgresql-postgis-font-de-veritat]]: ja no diuen que no hi ha cap còpia, i expliquen que són a la mateixa VM.

## Pendent / següents passos

- [ ] Push i PR només quan la persona responsable ho demani.

## US de Taiga

- TG-386 (còpia de la base de dades abans de migrar)
