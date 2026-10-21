---
titol: "TG-45: alta automàtica, logout i pantalla de login"
tipus: sessio
estat: vigent
data: "2026-10-21"
us: ["TG-45", "TG-136", "TG-137", "TG-138", "TG-139", "TG-140", "TG-141", "TG-142"]
font: "backend/app, backend/tests, frontend/src, frontend/openapi; Taiga: US TG-45 i TG-43"
etiquetes: [sessio, backend, frontend, auth, usuaris, logout]
---

# Sessió 2026-10-21 · Alta automàtica, logout i pantalla de login

## Objectiu
US TG-45: que el compte es creï sol al primer accés amb Google, poder tancar la sessió (servidor i app) i, a petició de la persona, tenir la pantalla d'inici de sessió amb l'estètica Frutiger Cosmo (només la UI; el flux OAuth és de TG-43).

## Què s'ha fet
- **TG-136:** `User.record_login` i `User.account_status` (l'esborrat preval sobre qualsevol altre estat) amb tests de domini.
- **TG-137:** port `UserRepository`, `UserService.sign_in`, `SqlUserRepository` (alta amb `INSERT … ON CONFLICT DO NOTHING`, segura davant concurrència) i `UserAccountGateway`, que substitueix el gateway provisional de TG-44. Camp opcional `language` a `POST /api/auth/google`. Error nou `EMAIL_ALREADY_REGISTERED` (409) al catàleg d'errors.
- **TG-138:** `AuthService.logout(token)`: revoca la sessió sencera pel `sid`; idempotent.
- **TG-139:** `POST /api/auth/logout` (204) i `GET /api/users/me`; seccions als tres README del backend.
- **TG-140:** tests d'integració contra PostgreSQL i Redis reals (alta, accés recurrent, concurrència, 409, esborrat, suspès, `/users/me`, logout).
- **TG-141:** `features/auth` (`tokenStorage` amb `expo-secure-store`, `useLogout`, `LogoutButton`), pantalla `/login` amb la pluja de Perseides (`PerseidShower`) i botó «Continua amb Google» amb la G de Google; els tipus de l'API es generen ara de l'OpenAPI real del backend.
- **TG-142:** tests de `tokenStorage`, `logout`, `useLogout`, `LogoutButton` i de la pantalla de login.
- **Revisió d'arquitectura** (subagent `reviewer-arquitectura`): 0 crítiques i 1 alta, ja corregida. El logout no tancava la sessió amb un access token caducat (`exp`); ara `TokenCodec.decode(token, verify_expiry=False)` només s'usa per identificar la sessió, amb tests amb JWT real caducat. També: `language` amb `max_length`, `save_last_login` amb un sol `UPDATE`, el logout neteja els tokens encara que no es puguin llegir i no hi ha doble anunci a Android.
- **Cinc punts de la revisió, resolts a petició de la persona:**
  1. **Web:** `tokenStorage.web.ts` perquè `expo-secure-store` no existeix a web. Primer només en memòria i, a petició de la persona, ara a `sessionStorage` perquè sobrevisqui a la recàrrega (mor en tancar la pestanya; memòria com a reserva); vegeu [[0008-google-oauth2-pkce-jwks-i-sessio-propia]].
  2. **Colors fixos:** la traça de `PerseidShower` pren els tokens nous `meteor.head` i `meteor.tail` dels quatre temes (contrastos mesurats; al tema `dia` és índigo, perquè el blanc no es veu sobre el cel clar), documentats a `tokens.md` de la skill `estetica-frutiger-cosmo`.
  3. **Acció amb vidre:** nou `QuietButton` per a accions secundàries (ni gel ni vidre); `LogoutButton` el fa servir.
  4. **Acoblament `users` ↔ `auth`:** `AccountStatus` a `domain/shared`, codis comuns a `application/shared/error_codes.py`, `UserService.sign_in` sense `GoogleIdentity` i composició a `main.py`; tests d'arquitectura que ho vigilen ([[backend-hexagonal]]).
  5. **Logout silenciós:** si el servidor no ho confirma, `/login` ho explica (un 401 no avisa).
- **La «G» de Google** (a petició de la persona): la «G» dibuixada a mà era la antiga i no coincidia amb l'oficial. Ara s'usa el botó d'icona oficial del paquet `signin-assets.zip` de les directrius de marca, copiat byte per byte a `frontend/assets/google/` (SHA-256 verificat contra el paquet i protegit amb un test). Origen i regles a `assets/google/README.md`.
- A Taiga, la descripció de la US TG-43 explica què existeix i què li falta (flux PKCE, credencials, toasts, guard de ruta).

## Decisions preses
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] (secció «Concreció (TG-45)»): 409 per correu d'un altre compte sense vincular identitats, logout idempotent pel `sid`, `language` opcional, `/users/me` comprova l'estat a la base de dades.
- Dependències noves al frontend, fixades a les versions compatibles amb Expo SDK 57 i aprovades per la persona: `react-native-svg` 15.15.4, `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, `expo-secure-store` 57.0.4 i `phosphor-react-native` 3.0.6.
- Textos de la pantalla només en català (`strings.ts`), com l'APOD, fins que arribi i18next (TG-91).

## Canvis al vault
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]], [[api]], [[frontend]] i [[backend-hexagonal]] (regla de mòduls independents).
- Skill `estetica-frutiger-cosmo`: tokens `meteor.*`, recepta `QuietButton` i regla de la «G» oficial de Google.

## Pendent / següents passos
- [ ] TG-43: flux PKCE, credencials de Google, guard de ruta, toasts i claus i18n dels codis (incloent `EMAIL_ALREADY_REGISTERED`); eliminar el missatge temporal de `login.tsx`.
- [ ] Veure la pantalla de login en un dispositiu (incloent el logotip oficial de Google i la pluja de Perseides als quatre temes) (no s'ha pogut provar visualment: no hi ha `react-native-web`).
- [ ] El títol de `/login` i el de la home no compleixen el contrast sobre l'horitzó del tema `posta` (2,33:1); revisar quan `posta` sigui seleccionable.
- [ ] Quan s'implementi el panell d'admin, valorar la galeta `httpOnly` en lloc de `sessionStorage` (un XSS podria llegir els tokens) i no carregar-hi scripts de tercers.
- [ ] Decidir si la sessió ha d'usar `users.id` en lloc de `google_sub` (heretat de TG-135).
- [ ] Tancar a Taiga les subtasques i, després de la PR aprovada, moure la US a `Done` (només la persona).

## US de Taiga
- TG-45, tasques TG-136 a TG-142; TG-43 (coordinació)
