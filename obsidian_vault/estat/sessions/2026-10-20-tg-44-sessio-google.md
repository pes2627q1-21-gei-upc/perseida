---
titol: "Sessió 2026-10-20: validació de tokens de Google i sessió pròpia (TG-44)"
tipus: sessio
estat: vigent
data: 2026-10-20
us: ["TG-44"]
font: "Taiga: US TG-44 i tasques #281 a #293; branca feature/TG-44-sessio-google"
etiquetes: [sessio, backend, autenticacio, jwt, jwks, redis, tg-44]
---

# Sessió 2026-10-20 · Validació de tokens de Google i sessió pròpia (TG-44)

## Objectiu

Que el backend validi l'`id_token` de Google via JWKS i emeti una sessió pròpia (dos JWT) desada a Redis, amb un endpoint de renovació i una dependència per protegir endpoints privats ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]).

## Què s'ha fet

- Domini `auth` (models i ports `GoogleTokenVerifier`, `TokenCodec`, `SessionStore`, `AccountGateway`) i `AuthService` amb `login`, `refresh` i `authenticate`, provat amb fakes.
- Adaptadors: `JwtTokenCodec` (PyJWT, HS256), `GoogleJwksVerifier` (httpx, claus 1 h) i `RedisSessionStore` (`session:<type>:<jti>`).
- Endpoints `POST /api/auth/google` i `POST /api/auth/refresh`, `CurrentSessionDep` i un `AccountGateway` provisional que accepta tots els comptes.
- Dependències `pyjwt[crypto]==2.15.1` i `httpx` a producció; `AuthSettings` (`GOOGLE_CLIENT_ID`, `JWT_SECRET` d'almenys 32 caràcters, durades).
- Codis d'error nous al catàleg de `gestio-errors`: `INVALID_GOOGLE_TOKEN`, `INVALID_SESSION`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`, `IDENTITY_PROVIDER_UNAVAILABLE` i `SESSION_UNAVAILABLE`.
- Proves unitàries, d'integració de l'API (Google simulat amb `respx`) i d'integració de Redis.
- Secció «Authentication» als README del backend (en, ca, es).

## Decisions preses

- Cap ADR nova: la concreció és a [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] (format de la sessió, claus a Redis i conseqüències).
- `AuthService` es construeix al `lifespan` i no amb un provider `@lru_cache`, perquè necessita els clients de Redis i HTTP i el verificador guarda les claus de Google en memòria ([[0017-injeccio-de-dependencies-i-services-singleton]]).
- Si Redis cau, el magatzem de sessions llança `SESSION_UNAVAILABLE` (503) en lloc de comportar-se com un *miss*; codi i textos aprovats per la persona.
- El `JWT_SECRET` exigeix 32 caràcters com a mínim (RFC 7518, secció 3.2) i el decode del JWT fixa l'algorisme i exigeix `sub`, `jti`, `type`, `iat` i `exp`.
- El verificador de Google no descarrega les claus més d'un cop per minut, perquè uns `kid` inventats no ens facin martellejar Google.

## Canvis al vault

- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]: concreció de TG-44 i conseqüències (Redis reiniciat, dependència de Redis).
- [[api]]: secció d'autenticació, configuració i estat d'implementació.
- [[redis]]: sessions i convenció de claus `session:<type>:<jti>`.

## Pendent / següents passos

- [ ] TG-45: implementar `AccountGateway` (alta al primer accés) i el tancament de sessió; substituir `ProvisionalAccountGateway`.
- [ ] Desplegament: afegir `GOOGLE_CLIENT_ID` al `.env.example` de l'arrel i donar d'alta `GOOGLE_CLIENT_ID` i `JWT_SECRET` a GitHub Actions; si no, `verify-config` falla.
- [ ] Frontend: claus i18n ca/es/en dels sis codis nous i URL `/api/auth/...` per a la TG-43.
- [ ] Executar els tests d'integració amb un Redis real (`REDIS_HOST`); aquí només s'han pogut provar amb un servidor simulat.
- [ ] Valorar fer atòmica la comprovació i l'esborrat del refresh (`SessionStore.delete` que retorni `bool`).

## US de Taiga

- TG-44
