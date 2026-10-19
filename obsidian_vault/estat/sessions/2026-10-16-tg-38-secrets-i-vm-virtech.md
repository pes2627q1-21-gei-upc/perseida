---
titol: "Sessió 2026-10-16: secrets, variables i VM de Virtech (TG-38, tasca #128)"
tipus: sessio
estat: vigent
data: 2026-10-16
us: ["TG-38"]
font: "Tasca #128 de Taiga; guia del servei Virtech; proves de connexió fetes en la sessió"
etiquetes: [sessio, infra, virtech, ssh, secrets, tg-38]
---

# Sessió 2026-10-16 · Secrets, variables i VM de Virtech (TG-38, tasca #128)

## Objectiu

Deixar a punt el que cal fora del codi perquè la CD per SSH (US TG-38) pugui existir: VM a Virtech, accés SSH des de GitHub Actions i secrets i variables del repositori.

## Què s'ha fet

- Creada la VM `perseida-prod` a Virtech (Ubuntu 24.04, 1 CPU, 4 GB, sense VPN, disc de 30 GB). Sense l'opció *Persistent*: amb ella la creació falla per quota 0 al datastore 100.
- Docker Engine i Compose instal·lats a la VM; carpeta `/opt/perseida`.
- Comprovat que el SSH oficial (`22043`) no és accessible sense VPN. Resolt fent que `sshd` escolti també al `8089` de la VM, accessible com `nattech.fib.upc.edu:40439`.
- Generada una clau ed25519 de desplegament (la privada només és al secret de GitHub; s'ha esborrat de la màquina local) i comprovat l'accés amb clau i verificació estricta de la clau del servidor.
- Afegida la clau pública personal d'Oriol a `authorized_keys` i desactivat l'accés per contrasenya (`PasswordAuthentication no` a `/etc/ssh/sshd_config.d/20-no-password.conf`); comprovat que entra amb clau i que la contrasenya és rebutjada. La contrasenya d'`alumne` només serveix ja per a `sudo` i la consola VNC de Virtech.
- Script `infra/scripts/add-team-key.sh`: demana nom i clau pública d'un company, la valida (rebutja claus privades i RSA < 3072 bits) i l'afegeix sense duplicar a `authorized_keys` de la VM. No conté cap secret, per això es versiona.
- Secrets: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `POSTGRES_PASSWORD` (nova, aleatòria, només per a producció) i `JWT_SECRET`.
- Variables: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_HOST=postgres`, `POSTGRES_PORT`, `REDIS_HOST=redis`, `REDIS_PORT`, `APP_ENV=production`, `SCHEDULER_ENABLED` i `SCHEDULER_TIMEZONE`.

## Decisions preses

- El `.env` de producció només porta el que usa el backend: `TAIGA_*` i `DRY_RUN` són del workflow de Taiga i no van al servidor. Cap ADR nova.

## Canvis al vault

- [[arquitectura-fisica]]: secció «Servidor de Virtech (VM)» amb la restricció d'SSH i els ports, i avís de l'HTTPS pendent de decidir.
- [[nginx-proxy-manager]]: avís que a Virtech no hi ha el port 443 públic.

## Pendent / següents passos

- [ ] Afegir a `authorized_keys` de la VM la clau pública de cada company d'equip (només queda la d'Oriol i la de desplegament).
- [ ] Planificar còpies de seguretat externes de PostgreSQL (la VM s'esborra al final del quadrimestre).
- [ ] Decidir quins ports `8080`–`8088` publiquen nginx-proxy-manager i la resta, i com es fa l'HTTPS sense els ports 80/443 (avís a [[arquitectura-fisica]]; pot acabar en una ADR).
- [ ] Documentar al README d'`infra/` el script `add-team-key.sh` (criteri 8 de TG-38).
- [ ] Resta de tasques de TG-38: workflow de CD, renderitzat del `.env`, rollback i README d'`infra/`.

## US de Taiga

- TG-38 (tasca #128)
