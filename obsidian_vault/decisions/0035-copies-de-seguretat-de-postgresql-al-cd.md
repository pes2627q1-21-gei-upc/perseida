---
titol: "Còpies de seguretat de PostgreSQL al CD"
tipus: adr
estat: acceptada
data: "2026-11-26"
us: ["TG-386"]
font: "Taiga: US TG-386 (criteris d'acceptació); decisions de la persona responsable (2026-10-31) en refinar la US"
etiquetes: [adr, cd, desplegament, backup, postgresql, alembic, infra]
---

# ADR-0035 · Còpies de seguretat de PostgreSQL al CD

## Context

El CD ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]) aplica les migracions d'Alembic en arrencar la imatge nova i, si el desplegament falla, les desfà amb `alembic downgrade`. Desfer una migració elimina les taules i columnes que havia creat, amb les seves dades, i fins ara no hi havia cap còpia de seguretat de la base de dades ([[0006-postgresql-postgis-font-de-veritat]], [[postgres]]). La US TG-386 demana una còpia abans de migrar i abans de desfer migracions, amb un procediment de restauració documentat. Els logs del workflow són públics: la còpia no pot imprimir secrets ni contingut de la base de dades.

## Decisió

`infra/scripts/deploy.sh` crida `infra/scripts/backup-db.sh` abans que cap migració s'apliqui o es desfaci. La còpia és un `pg_dump -Fc` fet dins del contenidor `db` i desat a la mateixa VM, fora del volum de dades de PostgreSQL. Si la còpia falla, el desplegament s'atura. La restauració **no és automàtica**: és un procediment manual documentat al README d'`infra/` (secció «Restore a backup»).

### Quan es fa i quan s'omet

- **Abans de desplegar:** només si hi ha migracions pendents, és a dir, si la revisió actual de la base de dades (`alembic_version`) és diferent del `head` d'Alembic de la imatge nova (`deploy.sh` el calcula amb `head_of`). Si no es pot saber el `head`, es fa la còpia sempre (`--always`).
- **Abans de qualsevol `alembic downgrade`:** sempre, tant en el rollback automàtic com en `deploy.sh --rollback`. Si la còpia falla, el downgrade no s'executa i l'API queda aturada.
- **S'omet amb un avís** (i el desplegament continua) si no hi ha contenidor `db` en marxa o la taula `alembic_version` no existeix (el primer desplegament: no hi ha res a copiar). Si la taula **existeix però no es pot llegir** (psql falla per connexió, recuperació, autenticació o temps d'espera), no es tracta com a base de dades buida: és una còpia fallida.

### Ubicació, nom i rotació

- **Directori:** `~/perseida/backups/` de l'usuari del desplegament, o `BACKUP_DIR` si està definit. Es crea amb mode 700 i els fitxers amb 600 (`umask 077`).
- **Nom:** `perseida-<AAAAMMDDTHHMMSSZ en UTC>-<git-sha sense el prefix sha->[-<revisió d'Alembic>].dump`. La revisió és la de la base de dades en el moment de la còpia. El git-sha és el de la versió que es desplega (o, en un downgrade, el de la imatge que ha migrat l'esquema).
- **Verificació:** la còpia s'escriu a un fitxer temporal, es comprova que no és buida i que `pg_restore --list` la llegeix, i només llavors agafa el nom definitiu.
- **Rotació:** es conserven les `BACKUP_KEEP` més recents (5 per defecte) i s'esborren les altres **només després d'una còpia bona**; una còpia fallida no toca les existents.

### Si la còpia falla

Qualsevol fallada (no poder llegir la revisió d'`alembic_version`, `pg_dump` amb codi diferent de 0, fitxer buit, verificació fallida, directori no escrivible o falta d'espai) fa que `backup-db.sh` surti amb error i esborri el temporal. `deploy.sh` s'atura **abans d'arrencar la imatge nova**: no s'aplica cap migració, no es toca `.deployed-tag` i el job queda en vermell. En un rollback, no es fa el downgrade.

### Variables

- `BACKUP_KEEP`: nombre de còpies que es conserven (enter ≥ 1). És una variable de GitHub (`BACKUP_KEEP=5`) que es renderitza al `.env`.
- `BACKUP_DIR`: directori de les còpies. És **opcional** (`cd.yml` la declara a `ENV_OPTIONAL`, i `render_env.py` la renderitza al `.env` només si hi ha una variable de GitHub definida, amb una **ruta absoluta**; el `~` no s'hi expandeix). GitHub no admet variables buides: sense variable, l'script usa `~/perseida/backups`. No s'ha d'editar a mà el `.env` del servidor, perquè cada desplegament el reescriu.
- `deploy.sh` només carrega del `.env` aquestes dues variables (la resta són secrets). `cd.yml` copia `backup-db.sh` a `/opt/perseida/` juntament amb `deploy.sh`.

## Conseqüències

### Positives

- Cada migració i cada downgrade tenen una còpia verificada prèvia: el que n'esborra dades ja no és irreversible.
- Una còpia fallida atura el desplegament abans de tocar l'esquema, sense migracions a mig fer.
- Només es copia quan cal (migracions pendents o downgrade): poc soroll i poc espai.
- El nom de la còpia porta la versió i la revisió d'Alembic, i diu amb quina imatge es pot restaurar.
- Cap secret als logs: les credencials es llegeixen de l'entorn del contenidor `db` i mai passen per arguments ni per la sortida.

### Negatives (assumides)

- **Les còpies són a la mateixa VM:** no protegeixen contra la pèrdua de la VM ni del disc; el servidor continua sent un punt únic de fallada ([[arquitectura-fisica]]).
- **Espai en disc:** fins a `BACKUP_KEEP` dumps a la VM; si el disc s'omple, la còpia falla i el desplegament s'atura (és el comportament desitjat, però cal alliberar espai).
- **La restauració és manual** i destructiva (esborra i recrea la base de dades): ningú no restaura una còpia pel seu compte.
- **Una base de dades gran faria tardar:** un dump lògic bloqueja el desplegament durant el temps que triga; amb les dades actuals és assumible.
- Una còpia d'abans d'una migració no inclou el que s'hagi escrit després: restaurar-la perd aquestes dades.
- **Contenidor `db` aturat amb dades al volum:** si el contenidor `db` no està en marxa, la còpia s'omet amb un avís i el `docker compose up` el pot arrencar i migrar sense còpia. No es detecta si el volum té dades.
- **Còpia fallida en el rollback automàtic:** quan es vol fer el downgrade, l'API ja s'ha aturat; si la còpia falla, el downgrade no s'executa i l'API queda aturada fins que algú hi intervingui a mà. És coherent amb «no es desfà res» i s'accepta.

## Alternatives descartades

- **Còpia a cada desplegament:** soroll i espai sense necessitat quan no hi ha migracions pendents.
- **`pg_dumpall` o format pla (SQL):** `-Fc` permet verificar amb `pg_restore --list` i restaurar de manera selectiva i comprimida; `pg_dumpall` inclou rols i globals que aquí no cal copiar.
- **Còpia fora de la VM (S3 o servidor remot):** protegiria contra la pèrdua de la VM, però afegiria credencials i infraestructura noves; queda fora de l'abast ara.
- **`pg_basebackup` o arxivat de WAL (recuperació a un punt del temps):** complexitat desproporcionada per a aquest projecte.

## US de Taiga relacionades

- TG-386 (còpia de la base de dades abans de migrar)

## Enllaços

- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]
- [[0006-postgresql-postgis-font-de-veritat]]
- [[0028-tdd-estricte-i-politica-de-testing-avancada]]
- [[postgres]]
- [[arquitectura-fisica]]
- Procediment de restauració: [README d'infra, «Restore a backup»](../../infra/README.md#restore-a-backup)
