---
titol: "Google OAuth2 amb PKCE, validació JWKS i sessió pròpia"
tipus: adr
estat: acceptada
data: "2026-10-20"
us: ["TG-85", "TG-43", "TG-44", "TG-45"]
font: "backend/README.md; frontend/README.md; infra/README.md; memòria §2.9.3; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07); Taiga: US TG-44 (criteris d'acceptació i notes de coordinació amb TG-45 i TG-87)"
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
- La sessió es pot revocar a l'instant (logout, suspensió d'un compte) esborrant la clau de Redis.

### Negatives (assumides)

- Si Redis es reinicia, es perden les sessions i els usuaris tornen a iniciar sessió amb Google.
- Cada petició privada consulta Redis; si no està disponible, l'API respon 503 `SESSION_UNAVAILABLE` en lloc de deixar passar.
- Les sessions a Redis no contradiuen [[0005-redis-nomes-com-a-cache-lazy]]: perdre-les només obliga a tornar a entrar, no fa perdre cap dada.

## Concreció (TG-44)

Detall d'implementació de la decisió anterior, confirmat a la US TG-44. No canvia la decisió.

- **Validació del token de Google:** signatura RS256 amb les claus públiques de Google (JWKS, en memòria 1 h; un `kid` desconegut provoca una descàrrega nova, com a màxim un cop per minut; si Google cau, es continuen usant les claus guardades), emissor (`https://accounts.google.com` o `accounts.google.com`), audiència (`GOOGLE_CLIENT_ID`), caducitat i `email_verified`. Si falla: 401 `INVALID_GOOGLE_TOKEN`; sense claus i sense resposta de Google: 503 `IDENTITY_PROVIDER_UNAVAILABLE`.
- **Format de la sessió:** dos JWT signats amb HS256 i `JWT_SECRET` (mínim 32 caràcters): *access token* de 15 minuts i *refresh token* de 30 dies, configurables amb `ACCESS_TOKEN_MINUTES` i `REFRESH_TOKEN_DAYS`. Claims: `sub` (el `google_sub`), `jti`, `type` (`access` o `refresh`), `iat` i `exp`. El decode fixa l'algorisme i exigeix els cinc claims.
- **Claus a Redis:** cada token emès es desa com `session:<type>:<jti>` amb TTL igual a la seva caducitat. Un token només és vàlid si la signatura i la caducitat són correctes **i** la clau existeix; si no, 401 `INVALID_SESSION`. Revocar és esborrar la clau.
- **Renovació:** `POST /api/auth/refresh` esborra el refresh anterior i emet un parell nou; reutilitzar-lo dona 401 `INVALID_SESSION`.
- **Comptes:** el port `AccountGateway` retorna l'estat (`active`, `suspended`, `banned`, `deleted`); suspès o banejat → 403 `ACCOUNT_SUSPENDED`, esborrat → 403 `ACCOUNT_DELETED`. Fins que TG-45 hi connecti la implementació real hi ha una de provisional que accepta tots els comptes.
- **Redis caigut:** el magatzem de sessions no tracta l'error com un *miss* (com fa la cache): llança 503 `SESSION_UNAVAILABLE`, perquè no es pot dir si un token és vàlid ni emetre'n de nous.
- **Endpoints:** `POST /api/auth/google`, `POST /api/auth/refresh` i la dependència `CurrentSessionDep`, que només accepta *access tokens*.

### Límits coneguts

- Dues peticions `refresh` simultànies amb el mateix token poden passar tot dues la comprovació abans que s'esborri (comprovar i esborrar són dues operacions). Es tancaria fent que `SessionStore.delete` retorni si l'entrada existia (el `DEL` de Redis és atòmic).

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-43 (inici de sessió amb Google OAuth2 i PKCE des de l'app mòbil)
- TG-44 (validació de tokens de Google via JWKS i emissió de sessió pròpia)
- TG-45 (model d'usuari, alta automàtica al primer accés i tancament de sessió)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[serveis-externs]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[redis]]
- [[api]]
- [[frontend]]
- [[backend-hexagonal]]
- [[testing]]
