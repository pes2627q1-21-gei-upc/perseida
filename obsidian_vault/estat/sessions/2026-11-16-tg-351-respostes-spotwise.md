---
titol: "Sessió 2026-11-16: respostes de Spotwise al contracte d'esdeveniments i servei d'espais (TG-351)"
tipus: sessio
estat: vigent
data: "2026-11-16"
us: ["TG-351"]
font: "Documents de Spotwise «Respostes de Spotwise sobre el servei d'esdeveniments» i «Servei d'espais de Spotwise per a Perseida» (novembre de 2026); decisions de Raquel en aquesta sessió (16/11/2026)"
etiquetes: [sessio, spotwise, contracte, esdeveniments]
---

# Sessió 2026-11-16 · Respostes de Spotwise (TG-351)

## Objectiu

Incorporar al vault, dins la PR #83 de TG-351, les dues respostes de Spotwise (grup 21B): la del servei d'esdeveniments que els oferim i la del servei d'espais que ens ofereixen.

## Què s'ha fet

- [[contracte-spotwise]]: nova secció «Respostes de Spotwise (novembre de 2026)» (origen des del seu backend, unes 2 peticions per hora, sense CORS, anglès, integració a l'Sprint 3) i detall del servei d'espais consumit (endpoint, accés, paràmetres, resposta, errors i límits).
- [[contracte-esdeveniments]]: les categories consten com a acceptades per Spotwise; el callout «Pendent de notificar a Spotwise» passa a «Acceptat per Spotwise».

## Decisions preses

Cap ADR nova. Decisions de Raquel:

- Un eclipsi de lluna arriba amb la categoria `lunar` i un de sol amb `solar`; no hi ha categoria `eclipse` (resposta a la pregunta de Spotwise).
- El servei d'espais es documenta a la mateixa PR que TG-351, tot i que la integració serà d'una altra US.

## Pendents

- Respondre a Spotwise la pregunta dels eclipsis i avisar-los de la data de desplegament (la volen a principis de l'Sprint 3, a partir del 30/11/2026).
- Quan Spotwise passi el token del servei d'espais, desar-lo com a secret de l'entorn, mai al repo ni al vault.
- Quan la ingestió classifiqui eclipsis, aplicar la regla `lunar`/`solar` de [[contracte-esdeveniments#Camps]].
