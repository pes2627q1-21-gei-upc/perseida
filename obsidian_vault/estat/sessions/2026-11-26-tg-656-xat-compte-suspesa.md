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
- **`login.tsx`:** el `notice` amb aquests codis mostra el text traduït que ja existia (`auth.errors.*`); cap text nou. `ACCOUNT_BLOCKED_CODES` viu a `useLogout.ts`, al costat de `LOGOUT_NOTICE`.
- **Backend:** sense canvis. El handshake del WebSocket només valida el token (ADR-0030); el 403 `ACCOUNT_*` el donen els handlers en enviar.
- **Vault:** actualitzada la nota «Límits coneguts» d'[[frontend]].
