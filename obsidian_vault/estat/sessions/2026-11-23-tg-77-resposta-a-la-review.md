---
titol: "Sessió 2026-11-23: resposta a la review de la PR 146 (TG-77, TG-586)"
tipus: sessio
estat: vigent
data: "2026-11-23"
us: ["TG-77", "TG-586"]
font: "Review de la PR #146; codi a frontend/src/app/login.tsx i frontend/src/features/admin"
etiquetes: [sessio, frontend, admin, review]
---

# Sessió 2026-11-23 · Resposta a la review de la PR 146

## Objectiu

Atendre la review de la PR 2 de 4 de TG-77 (panell d'administració: ruta `/admin/` i accés per rol), amb canvis demanats.

## Què s'ha fet

- **Login web segons el rol:** a la web, `/login` porta a `/panel` només si el rol és `admin` o `moderator` i a `/(app)` en la resta (també si el perfil no es pot llegir). Tests en vermell abans del codi (ADR-0028).
- **Documentació:** el README del frontend diu que `pnpm web` serveix sota `/admin/`, i [[frontend]] té la secció «Accés i rutes (TG-77)».

## Decisions preses

Cap ADR nova.

- **`baseUrl: /admin` es manté:** és el que permet que [[nginx-proxy-manager]] serveixi la SPA a `/admin/` ([[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]). No es treu per poder provar l'app a l'arrel; es documenta la URL.
- **`/login` es reutilitza** amb la redirecció per rol a la web, en lloc d'una pantalla de login pròpia del panell.
- **Guardià de sessió compartit** (`useSessionGuard`) entre l'app i el panell.
- **Si falla la lectura del perfil al panell**, es tanca la sessió local (esborrant els tokens) i es porta a `/login`.

## Verificació local

`pnpm lint` i `pnpm typecheck` nets; `pnpm test`: 2309 tests passats (174 suites), després del merge de `develop` amb la #147 (TG-57).
