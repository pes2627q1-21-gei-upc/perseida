# Perseida · Obsidian Vault

[English](README.md) | [Català](README.ca.md) | **Español**

Documentación del proyecto **Perseida** (proyecto de PES, UPC-FIB), mantenida como un vault de [Obsidian](https://obsidian.md) dentro del monorepo. Es el **contexto compartido** de los seis miembros del equipo y de sus asistentes de código con IA (Claude Code, Claude, Gemini), para que el código generado sea coherente en todo el equipo.

## Propósito

- Mantener una única fuente de verdad sobre **qué es el sistema y por qué se construyó así**.
- Que cualquier asistente parta de la misma información que cualquier compañero.
- Registrar las decisiones a medida que se toman, para no repetir debates ya resueltos.

Un fichero de instrucciones para agentes en la raíz del monorepo indica a los asistentes que deben leer este contexto antes de hacer cualquier cambio.

## Qué contiene el vault

La nota de entrada es [`00-index.md`](00-index.md): orden de lectura, fuentes de verdad y mapa de todas las carpetas.

| Área (carpeta) | Contenido |
|---|---|
| Arquitectura (`arquitectura/`) | Arquitectura física (un único servidor Virtech, Docker Compose, cinco servicios), backend hexagonal, frontend, modelo de dominio, servicios externos, contrato Spotwise y una nota por componente. |
| Decisiones (`decisions/`) | 15 ADR con justificación y alternativas descartadas (p. ej. Docker Compose en lugar de Kubernetes, moderación Kev-4B local, Redis solo como caché lazy). |
| Convenciones (`convencions/`) | GitFlow, Definition of Done, reglas de calidad, testing, asistentes de IA, actualización del vault y convenciones de las notas de Obsidian. |
| Producto (`producte/`) | NOT list, stakeholders, épicas e historias de usuario. |
| Estado (`estat/`) | Estado actual (`estat-actual`) y las notas de cada sesión de trabajo. |
| Guías (`guies/`) | Cómo leen y escriben el vault los agentes; arranque. |
| Plantillas (`plantilles/`) | Plantillas de ADR, componente, convención y sesión. |

## Trabajar con el vault

- Abre la carpeta `obsidian_vault/` como vault en Obsidian.
- Actualízalo **al final de cada sesión de trabajo** y **cada vez que se toma una decisión nueva**. Actualizar el vault cuando un cambio afecta a la documentación forma parte de la lista de revisión de las PR.
- Prefiere notas pequeñas y enlazadas (`[[wikilinks]]`) a documentos largos.
- No incluyas nunca secretos, credenciales (`.env`, tokens) ni datos personales de usuarios: los asistentes lo leen.
- Las notas se escriben en catalán.
- Cada nota se crea o edita con las skills de Obsidian (`.agents/skills`, véase [`AGENTS.md`](../AGENTS.md)).
- El hook `SessionStart` de Claude Code inyecta el índice y el estado actual; el resto de agentes leen `AGENTS.md`. Véase [cómo leer el vault como agente](guies/llegir-el-vault-com-a-agent.md).

## Reglas para los asistentes de IA (resumen)

- La autora o el autor de una PR es responsable de todo el código que contiene, lo haya escrito esa persona o un asistente, y sabe explicarlo.
- Los asistentes trabajan en ramas `feature/*`; no pueden fusionar ni saltarse las ramas protegidas.
- El código generado con IA pasa por la misma CI, Quality Gate y revisión entre compañeros.
- Se comprueba que las librerías y APIs propuestas existen realmente; las dependencias nuevas se añaden con `uv`/`pnpm` y versión fijada.
- Las skills de Obsidian son obligatorias para cualquier fichero del vault.
- Si una historia cambia la arquitectura o toma una decisión relevante, el vault se actualiza antes de fusionar la PR.

## Relacionado

[Backend](../backend/README.es.md) · [Frontend](../frontend/README.es.md) · [Infraestructura](../infra/README.es.md)

## Equipo

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
