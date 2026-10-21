---
titol: "Google OAuth2 amb PKCE, validació JWKS i sessió pròpia"
tipus: adr
estat: acceptada
data: "2026-10-21"
us: ["TG-85", "TG-43", "TG-44", "TG-45"]
font: "backend/README.md; frontend/README.md; infra/README.md; memòria §2.9.3; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07); Taiga: US TG-44 (criteris d'acceptació i notes de coordinació amb TG-45 i TG-87); Taiga: US TG-45 (criteris d'acceptació)"
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
- Les sessions a Redis no contradiuen [[0005-redis-nomes-com-a-cache-lazy]] (que té una esmena que ho recull): perdre-les només obliga a tornar a entrar, no fa perdre cap dada.

## Concreció (TG-44)

Detall d'implementació de la decisió anterior, confirmat a la US TG-44. No canvia la decisió.

- **Validació del token de Google:** signatura RS256 amb les claus públiques de Google (JWKS, en memòria 1 h; un `kid` desconegut provoca una descàrrega nova, com a màxim un cop per minut; si Google cau, es continuen usant les claus guardades), emissor (`https://accounts.google.com` o `accounts.google.com`), audiència (`GOOGLE_CLIENT_ID`), caducitat i `email_verified`. Si falla: 401 `INVALID_GOOGLE_TOKEN`; sense claus i sense resposta de Google: 503 `IDENTITY_PROVIDER_UNAVAILABLE`.
- **Format de la sessió:** dos JWT signats amb HS256 i `JWT_SECRET` (mínim 32 caràcters): *access token* de 15 minuts i *refresh token* de 30 dies, configurables amb `ACCESS_TOKEN_MINUTES` i `REFRESH_TOKEN_DAYS`. Claims: `sub` (el `google_sub`), `jti` (únic per token), `sid` (identificador de sessió, compartit per l'access i el refresh del mateix parell), `type` (`access` o `refresh`), `iat` i `exp`. El decode fixa l'algorisme i exigeix els sis claims.
- **Claus a Redis:** cada token emès es desa com `session:<type>:<jti>` amb TTL igual a la seva caducitat. Un token només és vàlid si la signatura i la caducitat són correctes **i** la clau existeix; si no, 401 `INVALID_SESSION`. Revocar és esborrar la clau.
- **Índex per usuari:** a més, cada usuari té el set `user_sessions:<sub>` amb membres `<sid>:<type>:<jti>`, amb un TTL que s'allarga fins al del token que viu més. `SessionStore` exposa `revoke_session(sub, sid)` (el parell d'una sessió, per al tancament de sessió, TG-45) i `revoke_all(sub)` (totes les sessions d'un usuari, per a la suspensió i el baneig i per tancar el WebSocket). Es fa ara perquè canviar el contracte del port més endavant obligaria a migrar les sessions ja emeses.
- **Renovació:** `POST /api/auth/refresh` esborra el refresh anterior i emet un parell nou amb el **mateix `sid`**; reutilitzar-lo dona 401 `INVALID_SESSION`. És atòmic: `SessionStore.delete` retorna si ha esborrat l'entrada (el `DEL` de Redis ho és) i, de dos refresh simultanis amb el mateix token, només un obté parell nou. `refresh` no consulta l'estat del compte: la suspensió o el baneig revoquen les sessions amb `revoke_all`, i llavors el refresh falla amb 401 perquè la clau ja no hi és.
- **Comptes:** el port `AccountGateway` retorna l'estat (`active`, `suspended`, `banned`, `deleted`); suspès o banejat → 403 `ACCOUNT_SUSPENDED`, esborrat → 403 `ACCOUNT_DELETED`. La implementació real és de TG-45 (vegeu més avall); la provisional ja s'ha eliminat.
- **Redis caigut:** el magatzem de sessions no tracta l'error com un *miss* (com fa la cache): llança 503 `SESSION_UNAVAILABLE`, perquè no es pot dir si un token és vàlid ni emetre'n de nous.
- **Endpoints:** `POST /api/auth/google`, `POST /api/auth/refresh` i la dependència `CurrentSessionDep`, que només accepta *access tokens*.

### Límits coneguts

- Rotació de claus de Google: un token vàlid amb un `kid` nou, rebut just després d'una descàrrega de claus, dona 401 `INVALID_GOOGLE_TOKEN` fins que passi el minut. És un cas rar i l'usuari reintenta.

## Concreció (TG-45)

Detall d'implementació de l'alta d'usuari i del tancament de sessió, confirmat a la US TG-45 i a la seva implementació. No canvia la decisió.

- **Alta automàtica:** `UserAccountGateway` implementa `AccountGateway` i delega a `UserService.sign_in`. Un `google_sub` que no existeix crea l'usuari (rol `user`, nom i avatar del perfil de Google); un `google_sub` existent només actualitza `last_login_at`. Un compte esborrat, suspès o banejat no es modifica i el login es rebutja amb 403. El `google_sub` d'un compte esborrat queda reservat: no se'n crea cap de nou ([[0023-convencions-del-model-de-dades]]).
- **Concurrència:** l'insert d'usuari és `INSERT … ON CONFLICT DO NOTHING` sobre `email` i, després, sobre `user_identities`, en una sola transacció. Dos primers accessos simultanis del mateix `google_sub` deixen un únic usuari i una única identitat; el que perd rellegeix el compte guanyador.
- **Correu d'un altre compte:** si el correu ja pertany a un usuari lligat a un altre `google_sub`, el login respon 409 `EMAIL_ALREADY_REGISTERED`. Les identitats no es vinculen automàticament: vincular-les per correu permetria prendre un compte si algú obté un correu reutilitzat. Contrapartida assumida: l'error revela que aquell correu ja està registrat, però només a qui ja té un token de Google verificat d'aquest correu.
- **Idioma del primer accés:** `POST /api/auth/google` accepta un camp opcional `language` (`ca`, `es` o `en`); si falta o no és compatible, `ca`. Només es desa en crear el compte.
- **Logout:** `POST /api/auth/logout` revoca la sessió sencera (access i refresh) amb el `sid` del token rebut (`SessionStore.revoke_session`) i respon 204. És idempotent: un token caducat, invàlid o ja revocat, o cap token, també respon 204. Un access caducat revoca igualment el refresh viu, perquè comparteixen `sid`.
- **Perfil propi:** `GET /api/users/me` retorna `id`, `email`, `display_name`, `avatar_url`, `preferred_language` i `role`. Comprova l'estat del compte a la base de dades: 403 si és suspès o esborrat, tot i que la sessió sigui vàlida.
- **Frontend:** els tokens es desen només a `expo-secure-store`. El tancament de sessió crida el logout, esborra els tokens i la cache de dades i torna a `/login`; el dispositiu queda sense sessió encara que la crida falli (sense connexió o sessió ja caducada).

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
