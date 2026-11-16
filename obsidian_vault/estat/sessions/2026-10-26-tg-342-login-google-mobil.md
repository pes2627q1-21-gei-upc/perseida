---
titol: "Sessió 2026-10-26: el login amb Google no funciona al mòbil (TG-342)"
tipus: sessio
estat: vigent
data: "2026-10-26"
us: ["TG-342"]
font: "Tasca TG-342 de Taiga; frontend/src/features/auth/"
etiquetes: [sessio, frontend, auth, bug, tg-342]
---

# Sessió 2026-10-26 · Login amb Google al mòbil

## Objectiu

Que «Continua amb Google» funcioni al mòbil per a qualsevol usuari i que, si no pot, digui per què en lloc de «Algo ha salido mal».

## Causes

1. `frontend/.env` no tenia els `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`: el flux acabava en `INTERNAL_ERROR` (missatge genèric no reintentable).
2. L'equip prova amb Expo Go, on la redirect `exp://` és rebutjada per Google.
3. L'esquema per defecte `perseida` no és acceptat per Google als clients natius.
4. L'app de Google Cloud era en mode *Testing* (només usuaris de test).

## Què s'ha fet

- `googleAuth.ts`: detecció d'Expo Go (`GOOGLE_SIGN_IN_EXPO_GO`) i client id absent (`GOOGLE_SIGN_IN_UNAVAILABLE`); textos ca/es/en a `locales/` i al catàleg d'errors.
- `googleConfig.ts`: esquema per defecte `app.perseida` (redirect `app.perseida:/oauth/callback`).
- READMEs: arrencada per a desenvolupadors a l'arrel i nota sobre Expo Go al README del frontend.
- EAS Build (organització d'Expo `perseida-fib-upc`): `frontend/eas.json` (perfil `preview`) i `projectId`/`owner` a `app.json`, perquè l'equip provi el login al mòbil sense Android Studio; a Windows `expo run:android` falla per rutes de més de 260 caràcters.
- Vault: [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] i [[frontend]].

## Decisions

- Textos dels dos codis nous aprovats per la persona responsable.
- Cap dependència nova (`expo-constants` ja hi era).

## Estat a 2026-10-28

Fet i comprovat:

- [x] Client Android «Perseida Android debug» amb package `app.perseida` i «Enable custom URI scheme».
- [x] SHA-1 del keystore d'EAS registrat al client (coincideix amb `eas credentials -p android`).
- [x] Tres comptes més com a usuaris de prova a Google Auth Platform (Públic).
- [x] Build d'EAS (perfil `preview`) des d'aquesta branca: l'APK s'instal·la i l'app funciona al mòbil. El build anterior (16e2647e) va fallar perquè `babel-preset-expo` no era dependència directa; ho va arreglar TG-329.
- [x] L'script `tsc` passa a `typecheck` ([[2026-10-28-tg-342-renom-typecheck]]) i l'app té la icona de Perseida ([[2026-10-28-tg-342-icona-de-l-app]]).

Pendent:

- [ ] Provar el login amb Google de cap a cap al mòbil: encara no s'ha pogut, perquè necessita el backend de producció amb el `GOOGLE_CLIENT_IDS` desplegat pel CD (no comprovat).
- [ ] Convidar els companys a l'organització d'Expo `perseida-fib-upc`.
- [ ] Revisar a quina plataforma correspon el quart client id de `GOOGLE_CLIENT_IDS`.
- [ ] Publicar l'app a «In production» (Audience): és la US TG-343. «Publicar app» està desactivat fins que s'ompli Branding (pàgina principal, privadesa i condicions).

## US de Taiga

- TG-342 (tasca #342)
