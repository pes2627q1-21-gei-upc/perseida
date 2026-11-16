---
titol: "Sessió 2026-10-13: servei de connexió amb l'endpoint de l'APOD (frontend)"
tipus: sessio
estat: vigent
data: 2026-10-13
us: ["TG-48"]
font: "treball de la tasca TG-117 de la US TG-48 (branca feature/TG-117-servei-apod)"
etiquetes: [sessio, frontend, tg-48]
---

> [!note] Superada per l'ADR-0028
> La regla «tests després del codi» que se segueix en aquesta sessió es va substituir a final de l'Sprint 1 pel TDD estricte ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

# Sessió 2026-10-13 · Servei de connexió amb l'endpoint de l'APOD

## Objectiu

Deixar al frontend el servei que consumeix `GET /api/apod` (TG-117, US TG-48), sense esperar el backend (TG-47), programant contra un contracte OpenAPI provisional.

## Què s'ha fet

- Client HTTP tipat (`openapi-fetch`) a `src/shared/api` amb timeout de 10 s i middleware d'errors.
- `AppError` i `toAppError` a `src/shared/errors`: converteixen `application/problem+json` ([[0018-errors-rfc-9457-amb-codis-estables]]) i errors de xarxa en un error d'aplicació (`code`, `status`, `correlationId`, `retryable`).
- `getApodToday()` i hook `useApodToday()` (TanStack Query: `staleTime` d'1 h, 1 reintent només si l'error és `retryable`) a `src/features/apod`.
- Contracte provisional `openapi/apod.provisional.json` i tipus generats amb `openapi-typescript` (`pnpm run api:generate`).
- Configuració de Jest (`jest-expo`) i 32 tests, 100 % de línies. Els tests s'han escrit després del codi ([[0019-tests-despres-del-codi]]).

## Decisions preses

- Endpoint `GET /api/apod` públic, amb `staleTime` d'1 h i 1 reintent.
- Reintents només per a errors de xarxa, 408, 429 i 5xx.
- Dos codis nous del client: `NETWORK_ERROR` i `INVALID_RESPONSE` (cal text ca/es/en).

## Pendent / següents passos

- [ ] Obrir la PR cap a `develop` i demanar revisió.
- [ ] Substituir el contracte provisional pel real quan arribi TG-47 i regenerar `schema.d.ts`.
- [ ] Acordar amb qui porta TG-46 l'entitat i el port de l'APOD.
- [ ] Textos ca/es/en per a `NETWORK_ERROR` i `INVALID_RESPONSE` (TG-91).
- [ ] TG-118 a TG-121: maquetació, renderitzat multimèdia, estats d'error i proves.

## US de Taiga

- TG-48