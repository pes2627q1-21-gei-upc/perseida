---
titol: "Google OAuth2 amb PKCE, validació JWKS i sessió pròpia"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-43", "TG-44", "TG-45"]
font: "backend/README.md; frontend/README.md; infra/README.md; memòria §2.9.3; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, autenticacio, oauth2, pkce, jwks, seguretat]
---

# ADR-0008 · Google OAuth2 amb PKCE, validació JWKS i sessió pròpia

## Context

Cal gestionar sessions d'usuari a l'app mòbil. Els requisits de seguretat (memòria §2.9.3) fixen que no s'emmagatzema cap contrasenya (autenticació delegada a Google OAuth) i que el 100 % dels endpoints privats rebutgin peticions sense JWT vàlid (HTTP 401/403). Google Identity és un servei extern amb una tasca molt concreta que no té sentit reimplementar (incepció 2 del 02-10-2026).

## Decisió

L'app mòbil fa l'inici de sessió amb Google OAuth2 i PKCE. El backend valida els tokens de Google via JWKS i emet una sessió pròpia (JWT). L'alta d'usuari és automàtica al primer accés i hi ha tancament de sessió.

## Conseqüències

### Positives

- No s'emmagatzema cap contrasenya.
- Els endpoints privats es poden verificar amb proves d'integració que comproven el rebuig sense sessió vàlida.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-43 (inici de sessió amb Google OAuth2 i PKCE des de l'app mòbil)
- TG-44 (validació de tokens de Google via JWKS i emissió de sessió pròpia)
- TG-45 (model d'usuari, alta automàtica al primer accés i tancament de sessió)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[serveis-externs]]
- [[api]]
- [[frontend]]
- [[backend-hexagonal]]
- [[testing]]
