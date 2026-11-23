---
titol: "Sessió 2026-11-22: punts de trobada amb Spotwise (TG-352)"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-352", "TG-629", "TG-657"]
font: "Taiga TG-352 i adjunts «Perseida-Spotwise-servei-espais.pdf» i «Spotwise-Perseida-servei-espais.pdf»; decisions de Raquel en aquesta sessió (22/11/2026)"
etiquetes: [sessio, spotwise, punts-de-trobada, backend, frontend, testing]
---

# Sessió 2026-11-22 · Punts de trobada amb Spotwise (TG-352)

## Objectiu

Implementar TG-352: recomanar locals (biblioteques i cafeteries) a prop de la usuària amb el servei d'espais de Spotwise, per a un esdeveniment i en crear o editar una sortida. Tres PR apilades amb `gh stack` sobre la PR #137 (TG-657).

## Què s'ha fet

- **PR 1, backend** (`feature/TG-352-backend-punts-trobada`): domini `meeting_points` (perfils, `Space`, `recommend`, port `SpaceSearch`), `MeetingPointService` amb cache de 5 min, `SpotwiseSpaceClient` (token, timeout de 5 s, límit de 60 crides per minut) i mock `ExampleSpaceSearch` sense `SPOTWISE_API_TOKEN`, `GET /api/meeting-points` amb sessió i 503 `MEETING_POINTS_UNAVAILABLE`. Entorn, secret de CD, catàleg d'errors i OpenAPI del frontend. Lliçó a la skill `implementar-us`: l'encàrrec al subagent porta la checklist de la skill de domini.
- **PR 2, dades i components de l'app** (`feature/TG-352-app-punts-trobada-dades`): `fetchMeetingPoints`, `useMeetingPoints`, `formatDistance`, `ProfileSwitch`, `MeetingPointRow`, `MeetingPointList` i textos ca/es/en.
- **PR 3, pantalles** (`feature/TG-352-app-punts-trobada-pantalles`): ruta `/meeting-points/[eventId]` i `MeetingPointsScreen`, botó «Punts de trobada» a `EventSheet`, `RecommendedPlaces` a `LocationField` i `HIDDEN_NESTED_ROUTES`. Corregeix també les rutes `/outings/*` de TG-629, que no s'obrien.
- **Prova manual de Raquel** a web (393×852, backend local amb el mock): textos en ca/es/en correctes. Hi va trobar dos errors, corregits a la PR 3 amb el seu test: l'enrere de les subrutes tornava a l'inici (`backBehavior="history"`) i el full de l'esdeveniment tapava la pantalla nova (ara s'amaga mentre el mapa no té el focus i torna en tornar enrere, decisió de Raquel).
- TDD estricte a les tres capes (`test:` abans de `feat:`), revisió de `reviewer-arquitectura` a cada PR i correccions.
- Taiga: tasques #481–#484 i #487 a Ready for test i #485–#486 a In progress, amb comentaris. Issue #658 nova (contrast de `StatusPanel`).

## Decisions preses

Totes de Raquel, el 22/11/2026. Detall a [[contracte-spotwise#Integració a Perseida (TG-352)]], [[api#Punts de trobada (TG-352)]] i [[frontend#Punts de trobada (TG-352)]].

- Endpoint `GET /api/meeting-points?profile=&lat=&lon=` amb sessió, no lligat a esdeveniment i sense filtre horari.
- Mock quan no hi ha token; secret `SPOTWISE_API_TOKEN` obligatori al CD; HTTP sense TLS acceptat i documentat.
- Es descarten els espais amb l'atribut del perfil a `null`; 1.500 m com a màxim; `distance_m` enter obligatori.
- Límit global de 60 crides per minut; avís a l'arrencada si s'usa el mock; enum desconegut descarta l'espai; sense dades caducades (503).
- App: `1 km` sense decimal, sense reintent automàtic, xip negatiu de grup, `open_now` fora; ubicació demanada en obrir la pantalla i de nou en tornar dels ajustos, reintent només si no està disponible; al formulari, botó que mostra 5 locals i s'amaga en triar.
- `HIDDEN_NESTED_ROUTES` per a rutes imbricades; imports entre `meeting-points` i `outings` acceptats.

## Errors registrats

Vegeu [[errors-de-testing.base]]. Quinze notes del 22/11/2026 amb prefix `2026-11-22-tg-352-` i `2026-11-22-tg-629-`. Dues lliçons de `skill`/`convencio`: l'encàrrec als subagents ([[2026-11-22-tg-352-copia-openapi-desfasada]]) i les rutes imbricades ([[2026-11-22-tg-629-rutes-de-sortides-no-s-obren]]). Una d'oberta: [[2026-11-22-tg-352-spinner-statuspanel-sense-contrast]] (issue #658).

## Canvis al vault

- Modificats: `arquitectura/contracte-spotwise`, `arquitectura/serveis-externs`, `arquitectura/components/api`, `arquitectura/frontend`.
- Nous: notes d'error a `estat/errors/` i aquesta sessió.

## Pendent / següents passos

- [ ] Crear el secret de GitHub `SPOTWISE_API_TOKEN` abans de la release.
- [x] Prova manual a web a 393×852 (punts de trobada, formulari, `/outings/*`, enrere, idiomes).
- [ ] Provar també a 360, 768 i 1280 px, als quatre temes, i en un mòbil físic.
- [ ] `gh stack submit` de les tres PR (push des del terminal de Raquel: l'SSH no funciona des de l'agent) i revisió per una altra persona.
- [ ] Demanar HTTPS a Spotwise.
- [ ] Issue #658: contrast de l'spinner de `StatusPanel`.
- [ ] Taiga: #485 i #486 a Ready for test; US a Done després de fusionar.

## US de Taiga

- TG-352
- TG-629 (rutes de sortides corregides)
- TG-657 (base de l'stack)
