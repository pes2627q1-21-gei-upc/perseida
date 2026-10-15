---
titol: "Sessió 2026-10-14 · Planificació detallada de l'Sprint 1"
tipus: sessio
estat: vigent
data: "2026-10-14"
us: ["TG-33", "TG-43", "TG-46", "TG-91", "TG-322"]
font: "Petició del Scrum Master de l'Sprint 1; Taiga (sprint 1, 26 US, 197 tasques); repositori (PR #1–#17 i branques); vault; memòria; PES-Taiga, PES-Agile i PES-Deliverables"
etiquetes: [sessio, sprint, taiga, planificacio]
---

# Sessió 2026-10-14 · Planificació detallada de l'Sprint 1

## Objectiu

Que els punts de cada US de l'Sprint 1 estiguin repartits entre les seves tasques, que els bloquejos siguin entre tasques i que les US sense redactar (TG-46 i TG-91) quedin especificades i dividides.

## Què s'ha fet

- Atributs personalitzats de tasca a Taiga: «Story points», «Estimated Effort» i «Actual Effort» (hores, segons PES-Taiga). Les hores són una proposta; «Actual Effort» s'omple en tancar la tasca.
- Repartiment dels 206 punts de les 26 US entre les tasques (suma per US idèntica als punts de la US). Les US Done es van repartir segons l'esforç real de les PR (línies significatives, sense lockfiles ni skills vendoritzades); les obertes, segons la descripció i el «Temps estimat» de cada tasca. Tasques trivials valen 0.
- Bloquejos passats d'US a tasques (`Bloquejada per: #N`, refs de tasca o US) i desmarcats els de les 8 US. Graf sense cicles.
- TG-46 i TG-91: descripció i criteris redactats, 8 tasques noves cadascuna (#306–#313 i #314–#321). Decisions: TTL de l'APOD 24 h, variable `NASA_API_KEY`, fallback d'i18n en català, abast de TG-91 = infraestructura, textos d'error i pantalla de l'APOD.
- TG-43 reescrita només per a l'app (el backend validava el `code`, cosa que contradiu [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] i TG-44); tasques #229–#234 reconvertides. Tasques duplicades de TG-87, TG-89 i TG-194 reconvertides a verificar o consumir la peça de l'altra US.
- Script `.github/scripts/taiga_unblock.py` ampliat perquè desbloquegi també tasques (TG-322, a TG-33; 0 punts), amb proves. Branca `feature/TG-322-taiga-unblock-tasques`, sense PR.

## Decisions preses

Cap ADR nova. Les decisions de planificació són a Taiga (comentari a cada US) i a aquesta nota. El codi d'error 503 de l'APOD queda pendent d'aprovació humana al catàleg de `gestio-errors`.

## Canvis al vault

- Cap canvi més al vault.

## Pendent / següents passos

- [ ] PR de TG-322 cap a `develop` (la fa la persona) i comprovar amb `DRY_RUN=1`.
- [ ] Simona: obrir la PR de `feature/ci-backend-workflow` (tasques TG-248 a TG-252, sense PR).
- [ ] Xavi: aplicar els canvis demanats a la PR #15 (TG-40).
- [ ] Aprovar el codi d'error 503 de l'APOD i confirmar el contracte `POST /auth/google` entre TG-43, TG-44 i TG-45.
- [ ] Verificar la compatibilitat de `i18next`, `react-i18next` i `expo-localization` amb Expo SDK 57 (tasca #314).

## US de Taiga

- TG-33, TG-43, TG-46, TG-91, TG-322
