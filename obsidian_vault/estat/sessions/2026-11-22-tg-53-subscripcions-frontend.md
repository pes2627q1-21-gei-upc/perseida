---
titol: "Sessió 2026-11-22: subscripcions a esdeveniments, app (TG-53, PR 2 de 2)"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-53"]
font: "Taiga: TG-53 i tasques #561 i #562; decisions de Manel (21/11/2026); revisió de reviewer-arquitectura sobre el diff"
etiquetes: [sessio, frontend, esdeveniments, accessibilitat]
---

# Sessió 2026-11-22 · Subscripcions a esdeveniments, app (TG-53)

## Objectiu

Deixar a punt la PR 2 de 2 de TG-53: seguir un esdeveniment des del llistat i veure els seguits a «Els meus». El backend ja és a `develop` (PR #105). La pantalla parteix de la #133 (app de TG-51), ja fusionada.

## Què s'ha fet

- **Dades:** `listMySubscriptions`, `subscribe` i `unsubscribe` amb la sessió, i els hooks `useMySubscriptions` i `useToggleSubscription` (optimista, amb rollback i invalidació).
- **Pantalla:** pestanyes «Tots | Els meus» a Esdeveniments (`GelSegmented`), estrella per seguir a cada `EventRow` i `MyEvents` amb estats de càrrega, buit i error.
- **Textos:** ca/es/en (`events.tabs.*`, `events.subscription.follow`, `events.mine.empty` i `errors.EVENT_ALREADY_ENDED`).
- **Proves:** TDD estricte, un commit `test:` abans de cada `feat:`.
- **Revisió d'arquitectura** (sense CRÍTICA ni ALTA), corregida amb TDD:
  - l'error de la fila s'anuncia (regió viva `polite` i `announceForAccessibility` a iOS);
  - l'estrella queda deshabilitada mentre no hi ha subscripcions;
  - la llista es torna a demanar només quan acaba l'últim canvi, sense parpelleig.

- **Review de la Raquel a la PR**, corregida amb TDD:
  - les crides passen per `withSession` i renoven la sessió després d'un 401;
  - el rollback desfà només el toggle que falla;
  - en acabar s'invaliden també les sales del xat;
  - el xat i Esdeveniments comparteixen la clau i la crida de `GET /api/me/subscriptions`, i s'ha esborrat el duplicat del xat.

## Decisions preses

Totes són de Manel (21 i 22/11/2026) i cap no necessita ADR (presentació dins de [[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020]]):

- «Els meus» és una pestanya dins d'Esdeveniments, no una pantalla nova.
- El control és una estrella «Segueix».
- L'error d'una subscripció es mostra a la mateixa fila.
- L'error de la fila s'anuncia en mode `polite`, com la resta de l'app.
- Mentre no han arribat les subscripcions, l'estrella es deshabilita en lloc d'amagar-la.
- Una sola cache de subscripcions per a Esdeveniments i el xat, en lloc d'invalidar les claus del xat.

## Canvis al vault

- [[frontend]]: secció «Subscripcions a esdeveniments (TG-53)» i la fila de la pestanya `events`.
- [[model-de-domini]]: com fa servir l'app els endpoints de subscripció (substitueix el pendent).
- [[api]]: l'app de TG-53 ja no surt com a pendent.

## Pendent / següents passos

- [ ] Prova manual en un dispositiu real (lector de pantalla i sessió real).

## US de Taiga

- TG-53
