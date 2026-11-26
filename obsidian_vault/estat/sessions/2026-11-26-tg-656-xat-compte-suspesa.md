---
titol: "Sessió 2026-11-26: xat amb compte suspesa o esborrada (TG-656)"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-656"]
font: "Issue TG-656 de Taiga; codi a frontend/src/features/chat/hooks/useLiveConversation.ts i frontend/src/app/login.tsx"
etiquetes: [sessio, frontend, xat]
---

# Sessió 2026-11-26 · Xat amb compte suspesa o esborrada

## Objectiu

Decidir i implementar què passa quan enviar un missatge torna 403 `ACCOUNT_SUSPENDED` o `ACCOUNT_DELETED` (TG-656, sorgit de la revisió de TG-64).

## Decisió de producte

L'autor va triar l'opció **(c)**: tancar la sessió i anar a `/login`, **només al xat** (un tractament global al client de l'API quedaria per a una altra US). Cap ADR nova.

## Què s'ha fet

- **Tests en vermell abans del codi (ADR-0028):** a `useLiveConversation.test.tsx` (enviament, reintent i guardes de `FORBIDDEN`, 429, 422 i 5xx) i `LoginScreen.test.tsx`.
- **`useLiveConversation`:** en un d'aquests dos codis la bombolla queda `failed`, es crida `clearSession` i després `router.replace` a `/login` amb `notice=<codi>`. Cobreix el xat d'esdeveniment i el directe, que comparteixen el hook.
- **`login.tsx`:** el `notice` amb aquests codis mostra el text traduït que ja existia (`errors.ACCOUNT_SUSPENDED` i `errors.ACCOUNT_DELETED`, via `authErrorMessage` i `errorMessage`); cap text nou. `ACCOUNT_BLOCKED_CODES` viu a `features/auth/accountBlocked.ts`.
- **Backend:** sense canvis. El handshake del WebSocket només valida el token (ADR-0030); el 403 `ACCOUNT_*` el donen els handlers en enviar.
- **Vault:** actualitzada la nota «Límits coneguts» d'[[frontend]].

## Review prèvia (reviewer-arquitectura)

- Dues troballes ALTA corregides amb test en vermell abans: els mocks d'`expo-router` de `direct-chat` no tenien `useRouter` (35 tests fallits) i el tancament no navegava si `clearSession` rebutjava; a més, un guard perquè diverses bombolles no repeteixin el tancament. Notes: [[2026-11-26-tg-656-mocks-d-expo-router-sense-userouter]] i [[2026-11-26-tg-656-tancament-de-sessio-sense-guard-ni-catch]].
- `ACCOUNT_BLOCKED_CODES` i `isAccountBlocked` són a `features/auth/accountBlocked.ts` (sense dependència d'expo-router).

## Límits coneguts (a propòsit)

- Només es tanca la sessió en enviar: un 403 `ACCOUNT_*` en carregar el xat no té tractament (decisió de producte: només al xat, enviament).
- Les bombolles refusades queden `failed` (el reintent tornaria a fallar); `clearSession` buida la memòria cau abans que `replace` desmunti la pantalla.
