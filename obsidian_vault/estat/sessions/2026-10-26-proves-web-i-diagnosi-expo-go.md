---
titol: "Sessió 2026-10-26: proves d'arrencada, CORS local i diagnosi d'Expo Go"
tipus: sessio
estat: vigent
data: "2026-10-26"
us: ["TG-43"]
font: "Sessió de proves interactiva; backend/app/main.py; infra/.env; frontend/.env"
etiquetes: [sessio, frontend, backend, docker, auth, cors, expo-go, tg-43]
---

# Sessió 2026-10-26 · Proves d'arrencada, CORS local i diagnosi d'Expo Go

## Objectiu

Aixecar tot l'entorn de desenvolupament (PostgreSQL 18 amb PostGIS, Redis 8, backend FastAPI) i verificar el flux de frontend i inici de sessió de Google OAuth per a proves en local i en dispositiu Android.

## Què s'ha fet

1. **Aixecament de serveis i persistència:**
   - Sincronitzada la contrasenya del rol `perseida` a la base de dades PostgreSQL existent amb `POSTGRES_PASSWORD` de `infra/.env`.
   - Executades les migracions pendents d'Alembic a l'arrencada del contenidor (`ef67a1f41ec0` PostGIS, `ff2baaa95c59` users, `8b892a8ae4b4` apod).
   - Reconstruïda la imatge local `perseida-api` verificant que inclogui totes les dependències de producció (`httpx`, etc.).
2. **Resolució de CORS per a desenvolupament web:**
   - Afegit `CORSMiddleware` a `backend/app/main.py` quan `APP_ENV != "production"`, admetent orígens locals (`http://localhost:8081`, `http://127.0.0.1:8081`, etc.) per permetre que l'app web en Expo es comuniqui directament amb l'API sense bloquejos del navegador.
3. **Correcció de Google Client IDs a l'entorn Docker:**
   - Actualitzada la variable `GOOGLE_CLIENT_IDS` a `infra/.env` amb els Client IDs reals (Web, iOS, Android), resolent l'error 401 `INVALID_GOOGLE_TOKEN` produït per discrepància d'audiència (`aud`) a `GoogleJwksVerifier`.
4. **Verificació de cap a cap:**
   - Verificat el funcionament complet de l'inici de sessió amb Google a la versió web (`pnpm expo start --web`): generació de token, validació JWKS al backend, alta a la base de dades i navegació a `/(app)`.
5. **Diagnosi per a Expo Go i Android:**
   - Analitzats els motius del bloqueig a Expo Go: incompatibilitat del Client ID tipus Android amb el package `host.exp.exponent` i manca del deep link scheme nadiu registrat (`perseida://`).

## Decisions preses

- S'habilita `CORSMiddleware` exclusivament per a entorns de desenvolupament no productius (`APP_ENV != "production"`), mantenint la seguretat en producció on `nginx-proxy-manager` actua com a punt d'entrada d'un sol origen ([[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]).

## Canvis al vault

- Creació d'aquesta sessió de treball a `estat/sessions/2026-10-26-proves-web-i-diagnosi-expo-go.md`.

## Pendent / següents passos

- [ ] Generar una build nativa (Development Build / EAS Build) per validar el flux de Google OAuth amb el package `app.perseida` i certificat SHA-1 a Android real.
- [ ] Mantenir la PR de TG-43 llesta per a integració.

## US de Taiga

- TG-43 (inici de sessió amb Google OAuth2 i PKCE)
