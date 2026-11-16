---
titol: "Sessió 2026-10-21: canvis de la revisió de la PR #33 (TG-44)"
tipus: sessio
estat: vigent
data: 2026-10-21
us: ["TG-44"]
font: "Revisió de la PR #33 (2026-10-21); branca feature/TG-44-sessio-google"
etiquetes: [sessio, backend, autenticacio, redis, tg-44]
---

# Sessió 2026-10-21 · Canvis de la revisió de la PR #33 (TG-44)

## Objectiu

Atendre els punts de la revisió de la PR #33 sobre [[0008-google-oauth2-pkce-jwks-i-sessio-propia]].

## Què s'ha fet

- `.env.example`: `GOOGLE_CLIENT_ID`, comentari de `JWT_SECRET` i durades opcionals (comentades perquè el CD no les exigeixi); taula de `infra/README.md`.
- [[0005-redis-nomes-com-a-cache-lazy]]: esmena que recull les sessions a Redis.
- `refresh` atòmic: `SessionStore.delete(claims)` retorna `bool`.
- Índex `user_sessions:<sub>` i operacions `revoke_session(sub, sid)` i `revoke_all(sub)` al port `SessionStore`.
- Claim `sid` comú a l'access i al refresh (`SessionClaims`, codec i `REQUIRED_CLAIMS`); `refresh` el manté.
- Nota de la rotació de claus de Google com a límit conegut.
- ADR-0008, notes [[redis]] i [[api]] i README (en, ca, es) actualitzats.

## Decisions preses

- `SessionStore.save` i `delete` reben `SessionClaims` (cal `sub`, `sid` i `type` per mantenir l'índex); `exists` continua amb `(kind, jti)`.
- L'índex es manté amb transaccions (`MULTI/EXEC`); `revoke_*` fan `SREM` dels membres revocats i no `DEL` de l'índex, perquè un token desat entremig no es perdi.

## Pendent / següents passos

- [ ] Actualitzar a Taiga el criteri 4 de la US #44 (afegir `sid` a les claims).
- [ ] Donar d'alta `GOOGLE_CLIENT_ID` i `JWT_SECRET` a GitHub Actions.
- [ ] Executar els tests d'integració de Redis amb un Redis real (`REDIS_HOST`); aquí s'han pogut verificar només els unitaris.
- [ ] TG-45 (logout amb `revoke_session`), #78/#102 (`revoke_all`), #63 (WebSocket) i #43 (claus i18n).

## US de Taiga

- TG-44
