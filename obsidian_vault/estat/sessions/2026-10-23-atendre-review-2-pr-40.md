---
titol: "Sessió 2026-10-23: segona review de la PR #40 i CI en vermell (TG-38)"
tipus: sessio
estat: vigent
data: 2026-10-23
us: ["TG-38"]
font: "Review de raquelrubiosuarez a la PR #40 (CHANGES_REQUESTED, 2026-10-23); log del job `backend` de la CI"
etiquetes: [sessio, infra, cd, review, tg-38]
---

# Sessió 2026-10-23 · Segona review de la PR #40 (TG-38)

## Objectiu

Atendre les tres troballes de la segona review i deixar la CI en verd.

## Què s'ha fet

- CI: el test d'integració de l'APOD (`test_apod_api.py`, entrat amb TG-47 a `develop`) encara posava `GOOGLE_CLIENT_ID`; passa a `GOOGLE_CLIENT_IDS`.
- `deploy.sh`: abans d'arrencar una versió nova en desa el tag a `.attempted-tag`; `--rollback` el fa servir com a origen del downgrade (és la imatge que coneix les migracions noves) i l'esborra en acabar bé. Els avisos dels camins que no desfan res expliquen la sortida manual.
- README d'`infra/` (ca, es, en): `.attempted-tag` i les dues sortides després d'un CD que deixa l'API aturada.
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025]] i [[arquitectura-fisica]]: la decisió recull l'excepció de `.deployed-env`.

## Decisions

- Camí de recuperació manual: `.attempted-tag` (proposat a la review) en lloc d'un `--from <tag>`, perquè no exigeix saber quin tag ha migrat l'esquema.
- Provat amb un `docker` simulat (no amb Compose real): l'intent fallit queda desat i el downgrade corre amb la imatge de l'intent.

## US de Taiga

- TG-38
