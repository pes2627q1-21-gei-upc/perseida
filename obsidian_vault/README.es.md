# Perseida · Obsidian Vault

[English](README.md) | [Català](README.ca.md) | **Español**

> 🚧 **En construcción.** El vault se crea dentro de la historia del backlog «Obsidian Vault con contexto de arquitectura y decisiones para agentes de IA». El contenido siguiente describe el estado **previsto**.

Documentación del proyecto **Perseida** (proyecto de PES, UPC-FIB), mantenida como un vault de [Obsidian](https://obsidian.md) dentro del monorepo. Es el **contexto compartido** de los seis miembros del equipo y de sus asistentes de código con IA (Claude Code, Claude, Gemini), para que el código generado sea coherente en todo el equipo.

## Propósito

- Mantener una única fuente de verdad sobre **qué es el sistema y por qué se construyó así**.
- Que cualquier asistente parta de la misma información que cualquier compañero.
- Registrar las decisiones a medida que se toman, para no repetir debates ya resueltos.

Un fichero de instrucciones para agentes en la raíz del monorepo indica a los asistentes que deben leer este contexto antes de hacer cualquier cambio.

## Qué contiene el vault (previsto)

| Área | Contenido |
|---|---|
| Arquitectura | Arquitectura física (un único servidor Virtech, Docker Compose, cinco servicios), backend hexagonal, cliente móvil con soporte offline, modelos de dominio/UML. |
| Decisiones | Decisiones técnicas con justificación y alternativas descartadas (p. ej. Docker Compose en lugar de Kubernetes, planificador dentro del proceso, moderación Kev-4B local, Redis solo como caché). |
| Convenciones | GitFlow, plantilla de PR y lista de revisión, Definition of Ready/Done, reglas de calidad (`ruff`, `mypy`, ESLint, Prettier, Quality Gate de Sonar), estrategia de testing y estructura de los juegos de prueba. |
| Estado del proyecto | Estado actual y qué se hizo en cada sesión de trabajo. |
| Producto | Resumen de la inception: NOT list, stakeholders, épicas e historias de usuario, contratos de servicio con Spotwise. |

## Trabajar con el vault

- Abre la carpeta `obsidian_vault/` como vault en Obsidian.
- Actualízalo **al final de cada sesión de trabajo** y **cada vez que se toma una decisión nueva**. Actualizar el vault cuando un cambio afecta a la documentación forma parte de la lista de revisión de las PR.
- Prefiere notas pequeñas y enlazadas (`[[wikilinks]]`) a documentos largos.
- No incluyas nunca secretos, credenciales (`.env`, tokens) ni datos personales de usuarios: los asistentes lo leen.

## Reglas para los asistentes de IA (resumen)

- La autora o el autor de una PR es responsable de todo el código que contiene, lo haya escrito esa persona o un asistente, y sabe explicarlo.
- Los asistentes trabajan en ramas `feature/*`; no pueden fusionar ni saltarse las ramas protegidas.
- El código generado con IA pasa por la misma CI, Quality Gate y revisión entre compañeros.
- Se comprueba que las librerías y APIs propuestas existen realmente; las dependencias nuevas se añaden con `uv`/`pnpm` y versión fijada.

## Relacionado

[Backend](../backend/README.es.md) · [Frontend](../frontend/README.es.md) · [Infraestructura](../infra/README.es.md)

## Equipo

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
