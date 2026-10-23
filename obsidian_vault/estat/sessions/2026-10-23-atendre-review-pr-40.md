---
titol: "Sessió 2026-10-23: atendre la review de la PR #40 (TG-38)"
tipus: sessio
estat: vigent
data: 2026-10-23
us: ["TG-38"]
font: "Review de manelav a la PR #40 (CHANGES_REQUESTED, 2026-10-22); decisions de la persona responsable durant la sessió"
etiquetes: [sessio, infra, cd, review, tg-38]
---

# Sessió 2026-10-23 · Atendre la review de la PR #40 (TG-38)

## Objectiu

Aplicar els canvis demanats a la review de la #40, que ve de la integració amb TG-46 (#41 i #43).

## Què s'ha fet

- Incorporat `develop` a la branca (sense conflictes).
- Test de rendiment de l'APOD: `GOOGLE_CLIENT_ID` passa a `GOOGLE_CLIENT_IDS`.
- `NASA_API_KEY` a `ENV_SECRET_ONLY` de `cd.yml` i a la taula de secrets dels README d'`infra/` (ca, es, en).
- `deploy.sh`: abans de desfer migracions compara els noms de variable del `.env` amb els del darrer desplegament bo (`.deployed-env`). Si han canviat, o no es poden comparar, no es fa `alembic downgrade`.
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025]] passa a «acceptada» i recull el nou criteri.

## Decisions

- Criteri de la sonda: noms de variable canviats implica no fer downgrade. Cas segur: sense fitxer d'estat es considera que han canviat. Cost: un error de codi coincident amb una variable nova deixa l'API aturada fins a una intervenció manual, sense perdre dades.
- Els tests d'`infra/scripts/` fora de la CI: s'accepta per a aquesta US.

## Pendent

- [ ] Decidir si els secrets de repositori queden accessibles des de qualsevol branca o es posa `environment: production` a `verify-config` (el cas de `SSH_PRIVATE_KEY`).
- [ ] Push de la branca, resposta als comentaris i nova revisió (la persona).

## US de Taiga

- TG-38
