---
titol: "Sessió 2026-11-18: crides a l'API del xat i hooks de TanStack Query (TG-466 i TG-468)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-64"]
font: "Taiga: US TG-64, tasques #466 i #468"
etiquetes: [sessio, frontend, xat, api]
---

# Sessió 2026-11-18 · API del xat al frontend (TG-466 i TG-468)

## Objectiu

Capa de dades del xat al frontend: crides REST a les sales i a l'històric amb cursor, i els hooks de TanStack Query.

## Què s'ha fet

- **Tests en vermell (TG-466, commit `test:`):** tests de `listRooms`, `ensureRoom`, `fetchMessages`, `useRooms` i `useRoomMessages` (URL, `Bearer`, refresc en 401, `limit=50`, cursor codificat, errors problem+json, reintents i paginació).
- **Codi en verd (TG-468, commits `feat:`):** `src/features/chat/api/chat.ts` i `src/features/chat/hooks/useChat.ts`, amb `withSession`.
- **Revisió d'arquitectura:** cap troballa crítica, alta ni mitjana.

## Decisions preses

- **Abast de TG-466:** en aquesta PR només hi van els tests d'API i de hooks. Els tests de les pantalles, l'accessibilitat i els textos van a TG-469, en un commit `test:` abans del `feat:` de les pantalles (comentari a Taiga). Motiu: comitar-los abans deixaria la CI en vermell.
- **OpenAPI:** el schema ja tenia els endpoints del xat des de la PR #112; no s'ha regenerat.
- **Duplicació acceptada:** `retryOnceIfTransient` i `invalidResponse` segueixen la convenció actual de les features; moure'ls a `shared/` és deute tècnic per a totes alhora.

## Canvis al vault

- `arquitectura/frontend.md`: secció «Xat d'esdeveniment: API i hooks (TG-64)».

## Pendent / següents passos

- [ ] Hook de WebSocket compartit (branca `feature/TG-461-xat-socket`).
- [ ] Pantalles, i18n i accessibilitat (TG-469), amb els seus tests abans.
- [ ] Nota global del flux d'un missatge i actualitzar `api` i `redis` (TG-470).

## US de Taiga

- TG-64
- TG-466
- TG-468
