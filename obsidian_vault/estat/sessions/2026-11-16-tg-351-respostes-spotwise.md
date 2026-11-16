---
titol: "Sessió 2026-11-16: respostes de Spotwise al contracte d'esdeveniments i servei d'espais (TG-351)"
tipus: sessio
estat: vigent
data: "2026-11-16"
us: ["TG-351"]
font: "Documents de Spotwise «Respostes de Spotwise sobre el servei d'esdeveniments» i «Servei d'espais de Spotwise per a Perseida» (novembre de 2026); review de la PR #83 (manelav, 16/11/2026); decisions de Raquel en aquesta sessió (16/11/2026)"
etiquetes: [sessio, spotwise, contracte, esdeveniments]
---

# Sessió 2026-11-16 · Respostes de Spotwise (TG-351)

## Objectiu

Incorporar al vault, dins la PR #83 de TG-351, les dues respostes de Spotwise (grup 21B): la del servei d'esdeveniments que els oferim i la del servei d'espais que ens ofereixen.

## Què s'ha fet

- [[contracte-spotwise]]: nova secció «Respostes de Spotwise (novembre de 2026)» (origen des del seu backend, unes 2 peticions per hora, sense CORS, anglès, integració a l'Sprint 3) i detall del servei d'espais consumit (endpoint, accés, paràmetres, resposta, errors i límits).
- [[contracte-esdeveniments]]: les categories consten com a acceptades per Spotwise; el callout «Pendent de notificar a Spotwise» passa a «Acceptat per Spotwise».
- Merge de `develop` a la branca per resoldre el conflicte de [[contracte-spotwise]] amb la nota de TG-50 (ADR-0031): es conserven els canvis de totes dues bandes.

### Review de la PR #83

Canvis demanats a la review de la PR #83, atesos:

- El 429 del proxy porta `instance` (ADR-0018). Un `map` d'`http_top.conf` el treu de valors fixos, mai de `$uri`, perquè nginx no escapa JSON. El test del proxy ho comprova, també amb unes cometes al camí ([[nginx-proxy-manager]]).
- L'OpenAPI de `/api/events/active` i `/api/events/upcoming` documenta el 429 `RATE_LIMITED`. S'han regenerat `frontend/openapi/openapi.json` i `schema.d.ts`.
- El README d'`infra/` (en, ca, es) explica l'ordre d'activació i de retirada de `rate-limit.conf`.
- Els usuaris de l'app darrere d'un mateix NAT comparteixen el límit: queda documentat com a risc acceptat a [[nginx-proxy-manager]].
- Primer els commits `test:` en vermell i després el `fix:`/`feat:` ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

## Decisions preses

Cap ADR nova. Decisions de Raquel:

- Un eclipsi de lluna arriba amb la categoria `lunar` i un de sol amb `solar`; no hi ha categoria `eclipse` (resposta a la pregunta de Spotwise). Coincideix amb [[0031-fonts-d-esdeveniments-sota-demanda]]: Skyfield calcula els eclipsis de lluna (`lunar`) i l'USNO dona els solars (`solar`).
- El servei d'espais es documenta a la mateixa PR que TG-351, tot i que la integració serà d'una altra US.
- `instance` del 429 amb un `map` de valors fixos (no un valor únic ni una excepció a l'ADR-0018).
- El 429 es documenta a l'OpenAPI en aquesta PR.
- S'accepta que els usuaris darrere d'un mateix NAT comparteixin el límit.

## Pendents

- Respondre a Spotwise la pregunta dels eclipsis i avisar-los de la data de desplegament (la volen a principis de l'Sprint 3, a partir del 30/11/2026).
- Quan Spotwise passi el token del servei d'espais, desar-lo com a secret de l'entorn, mai al repo ni al vault.
- Tasca #479 a Taiga: adjuntar el missatge enviat a Spotwise i les seves respostes, i tancar-la quan se'ls hagi respost (punt 3 de la review).
- Comprovar a producció que `$remote_addr` és la IP pública del client (criteri 5).
- Afegir el job `proxy` als *required checks* de `develop` **només després de fusionar la PR #83**: fins llavors `develop` no té el job i totes les altres PR quedarien esperant el check («Expected — Waiting for status»). Es va provar abans d'hora i es va haver de treure (16/11/2026).
