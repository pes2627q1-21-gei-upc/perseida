<p align="center">
  <img src="assets/logo.png" alt="Perseida" width="320">
</p>

# Perseida

**English** | [Català](README.ca.md) | [Español](README.es.md)

> 🚧 **Under construction.** The project is in its inception/first-sprint phase. Structure and contents below describe the **planned** state defined in the project documentation and may change.

**Perseida** is a multiplatform mobile app for astronomy outreach, exploration and tracking of astronomical events, built as a PES project (UPC-FIB). This monorepo contains the mobile app and admin panel, the backend, the infrastructure and the project documentation.

## What the app offers

- Interactive **map** and filterable **list** of active and upcoming astronomical events; user-created events, subscription, details and calendar export (`.ics`).
- **APOD**: NASA Astronomy Picture of the Day.
- **Gamification**: daily streak, unlockable achievements, daily astrophysics quiz, astronomy minigame to challenge friends.
- **Community**: follow users, event chat rooms, 1-to-1 chats, social feed and explorer profile (level, trophies); *optional:* photo voting and 24 h ephemeral posts.
- **Observation zones** recommended from weather, light pollution and event location.
- **Notifications** (FCM), **offline mode**, **multi-language** (Catalan, Spanish, English) and an **admin panel**.

See the [frontend README](frontend/README.md) for the full list.

## Repository structure

| Directory | Content |
|---|---|
| [`backend/`](backend/README.md) | FastAPI service: REST API, real-time chat (WebSocket) and in-process scheduler. Hexagonal architecture. |
| [`frontend/`](frontend/README.md) | React Native + Expo mobile app (Android APK for now) and admin panel (React Native Web). |
| [`infra/`](infra/README.md) | Docker Compose and deployment configuration, CI/CD (GitHub Actions). |
| [`obsidian_vault/`](obsidian_vault/README.md) | Project documentation as an Obsidian vault: shared context for the team and AI assistants. |

## System overview

Everything runs on **a single Virtech server** orchestrated with **Docker Compose**.

```mermaid
flowchart LR
    PHONE[Android app<br/>SQLite outbox + cache] -- REST / WSS 443 --> NPM
    ADMIN[Admin browser<br/>admin SPA] -- HTTPS SPA + REST --> NPM
    subgraph VIRTECH[Virtech server - Docker Compose]
        NPM[nginx-proxy-manager<br/>TLS, serves media + admin SPA]
        API[api<br/>FastAPI: REST + WebSocket + APScheduler]
        MOD[moderation<br/>Kev-4B]
        REDIS[(Redis 8<br/>cache + pub/sub)]
        PG[(PostgreSQL 18<br/>+ PostGIS)]
        VOL[(media volume)]
        NPM -- proxy_pass --> API
        API -- sync HTTP --> MOD
        API --> REDIS
        API --> PG
        API --- VOL
        NPM --- VOL
    end
    API --> NASA[NASA Open APIs<br/>APOD, NeoWs]
    API --> OTHER[Weather and<br/>light-pollution APIs]
    API --> FCM[Firebase Cloud Messaging]
    PHONE -- OAuth2 + PKCE --> GOOGLE[Google Identity]
    API -- JWKS --> GOOGLE
    GHA[GitHub Actions] -- push image --> GHCR[GHCR]
    GHA -- SSH: render .env + compose up --> VIRTECH
    VIRTECH -- pull image --> GHCR
```

Known limitations (accepted in an academic project): a single server is a single point of failure, with no horizontal scaling and no automatic backups. iOS is compatible (React Native) but not deployed, as it would require a Mac, an Apple Developer account and an APNs key.

Details: [infrastructure](infra/README.md) · [backend architecture](backend/README.md#architecture-hexagonal) · [frontend architecture](frontend/README.md#architecture).

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React Native + Expo, TypeScript, Tailwind, i18next, SQLite, `pnpm` |
| Backend | Python, FastAPI, SQLModel + Alembic, APScheduler, `uv` |
| Data | PostgreSQL 18 + PostGIS, Redis 8 |
| Moderation | Kev-4B (local model) |
| Auth | Google OAuth2 + PKCE |
| Infrastructure | Docker Compose, nginx-proxy-manager, GitHub Actions, GHCR |
| Quality | `ruff`, `mypy`, ESLint, Prettier, `pytest`, Jest, SonarQube Cloud |

## Workflow and conventions

- Scrum: 3 sprints of about 3 weeks, a Scrum Master that rotates every sprint, and the course teaching staff acting as Product Owner (the client). The backlog lives in Taiga.
- Releases: one per sprint, SemVer starting at `0.1.0`. The sprint's Scrum Master cuts `release/*` before the sprint review; merging into `main` deploys the backend and publishes the APK as a GitHub release.
- GitFlow: `main` (production, triggers CD), `develop` (integration, CI), `feature/*`, `release/*`, `hotfix/*`. No direct push to `main`/`develop`.
- Every PR to `develop` needs green CI and approval from someone other than the author.
- Code generated with AI assistants goes through the same review and quality gates; the PR author is responsible for it.
- Never commit secrets or `.env` files.

## Service contract with Spotwise (group 21B)

- **Provided:** `GET /api/events/active` and `GET /api/events/upcoming` return relevant astronomical events (title, short description, category such as `lunar`, `solar`, `meteor_shower`).
- **Consumed:** Spotwise's space search (libraries and cafés in Barcelona) to suggest meeting points for events.
- The contract was agreed in Sprint 1; changes in Sprints 2-3 must be notified and justified, as they affect both teams.

## Project links

- Repository: [pes2627q1-21-gei-upc/perseida](https://github.com/pes2627q1-21-gei-upc/perseida)
- Backlog (Taiga): [alexga03-astronomia-pes](https://tree.taiga.io/project/alexga03-astronomia-pes)
- SonarQube Cloud: **not created yet** (pending).

## License

Distributed under the [GNU Affero General Public License v3.0](LICENSE).

## Team

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
