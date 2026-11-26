---
titol: "TG-656: el tancament de sessió del xat no navegava si clearSession fallava i es repetia"
tipus: error-testing
estat: corregit
data: 2026-11-26
us: [TG-656]
font: "Review de reviewer-arquitectura"
fase: review
capa: frontend
regressio: "frontend/src/features/chat/hooks/useLiveConversation.test.tsx::si clearSession rebutja, navega igualment a /login amb l’avís i dues bombolles refusades a la vegada tanquen la sessió i naveguen una sola vegada"
commit:
llico: cap
etiquetes: [error-testing, tg-656, frontend]
---

# `clearSession(...).then(replace)` sense catch ni guard idempotent

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Si `clearTokens()` rebutjava (SecureStore), la promesa quedava sense gestionar i la persona no anava a `/login`. Amb diverses bombolles refusades, cada una disparava un altre `clearSession` i un altre `router.replace`.

## Causa

El primer `feat:` cobria només el camí feliç d'un sol missatge.

## Correcció

`useRef` que fa el tancament idempotent i `clearSession(...).catch(...).finally(() => router.replace(...))`: es navega sempre, com fa `useLogout`.

## Test de regressió

Els dos tests citats al camp `regressio`.

## Lliçó

`cap`: una acció que acaba la sessió ha de navegar encara que la neteja falli (patró de `useLogout`) i no repetir-se.
