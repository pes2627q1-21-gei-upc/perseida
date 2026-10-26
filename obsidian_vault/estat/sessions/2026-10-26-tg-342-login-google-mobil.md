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
- Vault: [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] i [[frontend]].

## Decisions

- Textos dels dos codis nous aprovats per la persona responsable.
- Cap dependència nova (`expo-constants` ja hi era).

## Pendent (persona, a Google Cloud)

- [ ] Publicar l'app a «In production» (Audience).
- [ ] Client Android amb package `app.perseida`, SHA-1 de debug i «Enable custom URI scheme».
- [ ] Provar `pnpm expo run:android` amb un compte que no sigui de test.
- [ ] Revisar a quina plataforma correspon el quart client id de `GOOGLE_CLIENT_IDS`.

## US de Taiga

- TG-342 (tasca #342)
