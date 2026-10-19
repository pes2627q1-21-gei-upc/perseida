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
| API types     | Generated from the backend OpenAPI schema (`openapi-typescript`) |
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

## Run and test

```bash
cd frontend                       # from the repository root
pnpm install --frozen-lockfile    # install dependencies exactly as in pnpm-lock.yaml
pnpm expo start                   # start the Expo dev server (Android emulator / device)
pnpm lint                         # ESLint + Prettier (also checks formatting)
pnpm tsc                          # strict type check (tsc --noEmit)
pnpm test                         # Jest (jest-expo preset)
pnpm test --coverage              # tests + coverage report (coverage/lcov.info)
```

Releases: on each release merged into `main`, GitHub Actions publishes the **APK** as a GitHub release.

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

- **Versions:** the CI uses Node 22.23.3 (pinned in the workflow) and pnpm 10.28.0 (pinned in `packageManager` in `package.json`, which the workflow reads); use the same locally to reproduce a failure.
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
