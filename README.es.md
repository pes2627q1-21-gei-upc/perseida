# Perseida

[English](README.md) | [Català](README.ca.md) | **Español**

> 🚧 **En construcción.** El proyecto está en fase de inception/primer sprint. La estructura y el contenido siguientes describen el estado **previsto** según la documentación del proyecto y pueden cambiar.

**Perseida** es una aplicación móvil multiplataforma de divulgación, exploración y seguimiento de fenómenos astronómicos, desarrollada como proyecto de PES (UPC-FIB). Este monorepo contiene la app móvil y el panel de administración, el backend, la infraestructura y la documentación del proyecto.

## Qué ofrece la app

- **Mapa** interactivo y **lista** filtrable de eventos astronómicos activos y próximos; suscripción, detalles y exportación al calendario (`.ics`).
- **APOD**: imagen astronómica del día de la NASA.
- **Gamificación**: racha diaria, logros desbloqueables, quiz diario de astrofísica.
- **Comunidad**: seguimiento de usuarios, salas de chat de evento, chats 1-a-1, compartición y votación de fotografías, publicaciones efímeras de 24 h.
- **Zonas de observación** recomendadas a partir de meteorología, contaminación lumínica y ubicación del evento.
- **Notificaciones** (FCM), **modo offline**, **multilingüe** (catalán, castellano, inglés) y **panel de administración**.

Consulta el [README del frontend](frontend/README.es.md) para la lista completa.

## Estructura del repositorio

| Directorio | Contenido |
|---|---|
| [`backend/`](backend/README.es.md) | Servicio FastAPI: API REST, chat en tiempo real (WebSocket) y planificador dentro del proceso. Arquitectura hexagonal. |
| [`frontend/`](frontend/README.es.md) | App móvil React Native + Expo (por ahora APK de Android) y panel de administración (React Native Web). |
| [`infra/`](infra/README.es.md) | Configuración de Docker Compose y de despliegue, CI/CD (GitHub Actions). |
| [`obsidian_vault/`](obsidian_vault/README.es.md) | Documentación del proyecto como vault de Obsidian: contexto compartido para el equipo y los asistentes de IA. |

## Visión general del sistema

Todo se ejecuta en **un único servidor de Virtech** orquestado con **Docker Compose**.

```mermaid
flowchart LR
    PHONE[App Android] -- HTTPS / WSS --> NPM
    ADMIN[Panel admin] -- HTTPS --> NPM
    subgraph VIRTECH[Servidor Virtech - Docker Compose]
        NPM[nginx-proxy-manager]
        API[api<br/>FastAPI]
        MOD[moderation<br/>Kev-4B]
        REDIS[(Redis)]
        PG[(PostgreSQL<br/>+ PostGIS)]
        NPM --> API
        API --> MOD
        API --> REDIS
        API --> PG
    end
    API --> EXT[NASA Open APIs,<br/>meteo, FCM]
    PHONE -- OAuth2 + PKCE --> GOOGLE[Google Identity]
```

Detalles: [infraestructura](infra/README.es.md) · [arquitectura del backend](backend/README.es.md#arquitectura-hexagonal) · [arquitectura del frontend](frontend/README.es.md#arquitectura).

## Stack tecnológico

| Área | Tecnología |
|---|---|
| Frontend | React Native + Expo, TypeScript, Tailwind, i18next, SQLite, `pnpm` |
| Backend | Python, FastAPI, SQLModel + Alembic, APScheduler, `uv` |
| Datos | PostgreSQL 18 + PostGIS, Redis 8 |
| Moderación | Kev-4B (modelo local) |
| Autenticación | Google OAuth2 + PKCE |
| Infraestructura | Docker Compose, nginx-proxy-manager, GitHub Actions, GHCR |
| Calidad | `ruff`, `mypy`, ESLint, Prettier, `pytest`, Jest, SonarQube Cloud |

## Flujo de trabajo y convenciones

- GitFlow: `main` (producción, dispara el CD), `develop` (integración, CI), `feature/*`, `release/*`, `hotfix/*`. Sin push directo a `main`/`develop`.
- Toda PR hacia `develop` necesita CI en verde y la aprobación de alguien que no sea el autor.
- El código generado con asistentes de IA pasa por la misma revisión y los mismos quality gates; el autor de la PR es responsable de él.
- No hagas nunca commit de secretos ni de ficheros `.env`.

## Enlaces del proyecto

- Repositorio: [pes2627q1-21-gei-upc/perseida](https://github.com/pes2627q1-21-gei-upc/perseida)
- Backlog (Taiga): [alexga03-astronomia-pes](https://tree.taiga.io/project/alexga03-astronomia-pes)
- SonarQube Cloud: **aún no creado** (pendiente).

## Licencia

Distribuido bajo la [GNU Affero General Public License v3.0](LICENSE).

## Equipo

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
