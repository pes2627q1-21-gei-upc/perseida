# Perseida · Frontend

**English** | [Català](README.ca.md) | [Español](README.es.md)

> 🚧 **Under construction.** The project is in its inception/first-sprint phase. Structure and commands below describe the **planned** state defined in the project documentation and may change.

Mobile app and admin panel of **Perseida**, a multiplatform app for astronomy outreach, exploration and tracking of astronomical events, built as a PES project (UPC-FIB). Built with **React Native + Expo** and TypeScript. It is designed for Android and iOS; for now only the **Android** version (APK) is deployed.

## What the app offers

- Interactive **map** and filterable **list** of active and upcoming astronomical events; event creation, subscription and details.
- **APOD**: NASA Astronomy Picture of the Day.
- **Gamification**: daily streak, unlockable achievements (shareable), daily astrophysics quiz, astronomy minigame to challenge friends.
- **Community**: follow users, event chat rooms, 1-to-1 chats with persistent history, photo sharing and voting, 24 h ephemeral posts.
- **Observation zones** recommended from weather, light pollution and event location.
- **Notifications** (FCM) configurable by type, date and proximity; **calendar export** (`.ics`).
- **Offline mode**: local SQLite outbox and read cache, synchronized later (last-write-wins).
- **Multi-language**: Catalan, Spanish and English (device language detection + selector).
- **Admin panel** (SPA with React Native Web): user management and suspension, published-event supervision, usage metrics, report review queue. Access by role.
- "Living sky" look (Frutiger Cosmo): light, dark and sunset themes that follow the sky, plus a red night mode for stargazing; modes: Light, Dark, Follow system, Follow Sun.

## Tech stack

| Area          | Technology                                                       |
| ------------- | ---------------------------------------------------------------- |
| Framework     | React Native + **Expo**                                          |
| Language      | TypeScript (`strict`), Hermes engine                             |
| Styling       | Tailwind                                                         |
| i18n          | i18next                                                          |
| Local storage | SQLite (outbox + offline cache)                                  |
| Auth          | Google OAuth2 + PKCE                                             |
| Push          | Firebase Cloud Messaging                                         |
| API types     | Generated from the backend OpenAPI schema (`openapi-typescript`; copy of `/api/openapi.json` in `openapi/openapi.json`, then `pnpm api:generate`) |
| Admin web     | React Native Web (static bundle served by nginx-proxy-manager)   |
| Dependencies  | `pnpm`                                                           |
| Quality       | ESLint (TS, React, React Hooks), Prettier, SonarQube Cloud       |
| Tests         | Jest + React Native Testing Library                              |

## Architecture

```mermaid
flowchart LR
    subgraph Device[Android device]
        UI[Screens and components]
        HOOKS[Hooks / presentation logic]
        SYNC[Sync module]
        SQL[(SQLite<br/>outbox + cache)]
    end
    UI --> HOOKS --> SYNC
    SYNC <--> SQL
    SYNC -- HTTPS REST / WSS --> NPM[nginx-proxy-manager]
    NPM --> API[Backend API]
    GOOGLE[Google Identity] -- OAuth2 + PKCE --> UI
    FCM[Firebase Cloud Messaging] -- push --> UI
```

## Planned structure

```
frontend/
├── app/ or src/       # screens, components, hooks, services (Expo)
├── assets/
├── locales/           # ca / es / en translations
├── __mocks__/         # simulated API responses for tests
├── app.json           # Expo configuration
├── package.json
└── tsconfig.json
```

## Authentication and Session (TG-43)

- **Token Storage (`features/auth/tokenStorage.ts`)**: `saveTokens`, `getTokens`, `clearTokens`. Uses `expo-secure-store` on native (keychain/keystore) and `sessionStorage` on web (isolated per tab, ADR-0008). Never AsyncStorage.
- **Session Cleanup (`features/auth/session.ts`)**: `clearSession()` purges both stored tokens and the in-memory TanStack Query cache. Used by `useLogout` and by token renewal on 401 `INVALID_SESSION`.
- **Session Renewal (`features/auth/api/refreshToken.ts`)**: `refreshSession()` renews tokens via `POST /api/auth/refresh`. Serializes concurrent calls to ensure single-use refresh tokens are never burned.
- **Route Guard (`app/(app)/_layout.tsx`)**: Redirects unauthenticated users to `/login`; `/login` redirects authenticated users into the app (`/(app)`).

## Run and test

```bash
cd frontend                       # from the repository root
pnpm install --frozen-lockfile    # install dependencies exactly as in pnpm-lock.yaml
pnpm expo start                   # start the Expo dev server (Android emulator / device; Expo Go must match SDK 58)
pnpm web                          # same app in the browser (React Native Web)
pnpm lint                         # ESLint + Prettier (also checks formatting)
pnpm tsc                          # strict type check (tsc --noEmit)
pnpm test                         # Jest (jest-expo preset)
pnpm test --coverage              # tests + coverage report (coverage/lcov.info)
```

Google sign-in needs a native build: it does **not** work in Expo Go (the app shows a specific message). On Android run `pnpm expo run:android` (needs Android Studio/SDK); the Google Cloud Android client must have package `app.perseida` and the SHA-1 of `android/app/debug.keystore`, and `EXPO_PUBLIC_GOOGLE_*` set in `.env`.

**Test on a phone without Android Studio (EAS Build).** The Expo organisation `perseida-fib-upc` builds the APK in the cloud, so it also works on Windows without the Android SDK:

1. Ask an admin of the organisation to invite you, and sign in with `npx eas-cli@latest login`.
2. From `frontend/`, run `npx eas-cli@latest build -p android --profile preview`. The profile is in `eas.json` and only carries public `EXPO_PUBLIC_*` values (production backend).
3. When it finishes (10-20 min), open the link on the phone and install the APK.

The signing keystore lives in Expo and is shared: **never generate a new one**, because its SHA-1 would change and Google sign-in would stop working until it is registered again in Google Cloud. Sign-in against production also needs the backend to accept the client id (`GOOGLE_CLIENT_IDS`), and while the Google app is in *Testing* only the listed test users can sign in.

Releases: on each release merged into `main`, GitHub Actions publishes the **APK** as a GitHub release.

## Translations (i18n)

The app speaks Catalan (`ca`), Spanish (`es`) and English (`en`). It starts in the first of these that the device has in its language list, and in Catalan if none is. No text is written in the code: it comes from `locales/<language>.json` through [i18next](https://www.i18next.com) (`src/shared/i18n`).

**Add a text**

1. Add the same key to `locales/ca.json`, `locales/es.json` and `locales/en.json` (grouped by feature, e.g. `apod.retry`).
2. Use it in the component: `const { t } = useTranslation();` and `t('apod.retry')`.
3. `pnpm test` fails if a key exists in one language and not in another (`src/shared/i18n/locales.test.ts`).

**Add a text for an error code**: add `errors.<CODE>` to the three files and show it with `errorMessage(t, error.code, error.retryable)` (`src/shared/errors`). A code without text shows the generic message, never the server `detail`.

**Add a language** (e.g. `fr`)

1. Create `locales/fr.json` with exactly the same keys as `ca.json`.
2. Add it to `SUPPORTED_LANGUAGES` (`src/shared/i18n/detectLanguage.ts`) and to `resources` (`src/shared/i18n/index.ts`).
3. Add it to `locales` in `src/shared/i18n/locales.test.ts`.

## Continuous integration

The [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) workflow runs the `frontend` job on every pull request to `develop` or `main` and on every push to `develop` or `main`. In a PR it only runs if `frontend/**` or the workflow itself changed; otherwise the job shows as *skipped* and does not block the PR. A new push to the same PR cancels the previous run.

Exact commands (from `frontend/`, the same ones as the workflow, each one a separate step so you can see which fails):

```bash
cd frontend                       # from the repository root
pnpm install --frozen-lockfile    # fails if pnpm-lock.yaml is out of date
pnpm lint                         # ESLint + Prettier
pnpm tsc                          # strict type check
pnpm test --coverage --ci         # Jest + coverage report
```

- **Versions:** the CI uses Node 24.22.1 (pinned in the workflow) and pnpm 12.15.0 (pinned in `packageManager` in `package.json`, which the workflow reads); use the same locally to reproduce a failure. To update pnpm run `pnpm self-update` (`pnpm add -g pnpm` is rejected since pnpm 11.10).
- **Coverage:** the report is published as the `frontend-coverage` artifact (`lcov.info`). To download it: GitHub → **Actions** tab → the run → **Artifacts** section at the bottom of the summary page.
- **Requirements:** the job needs no secrets and no services.

## Testing and quality

- Jest runs with the `jest-expo` preset (`jest.config.js`) and there is a smoke test in `__tests__/`. React Native Testing Library is already used for hooks; the component tests and API mocks arrive with US #83.
- Priority on custom hooks and presentation logic (loading / error / empty states, form validation), main components (event cards, APOD screen, streak, report form, admin screens) and checking that every UI text has ca/es/en translation. The API client is mocked.
- Form validation feedback must appear in < 100 ms without a network call.
- New code of each PR: coverage ≥ 70 % and SonarQube Cloud Quality Gate. Purely visual components are excluded from coverage.
- UI-dependent acceptance criteria are checked manually on the release branch before each sprint review. No automated end-to-end tests.

## Conventions

- GitFlow with `feature/*` branches from `develop`; PR approved by someone other than the author, with passing CI.
- Same strict TypeScript and lint rules for the whole team (versioned config files).
- Code generated with AI assistants goes through exactly the same review and quality gates.

## Related

[Backend](../backend/README.md) · [Infrastructure](../infra/README.md) · [Obsidian vault](../obsidian_vault/README.md)

## Team

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
