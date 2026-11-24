---
titol: "Sessió 2026-11-24: els llocs recomanats es busquen des del lloc de la sortida (TG-661)"
tipus: sessio
estat: vigent
data: "2026-11-24"
us: ["TG-661", "TG-352"]
font: "Prova manual de Raquel; codi a frontend/src/features/outings/components"
etiquetes: [sessio, frontend, spotwise, sortides]
---

# Sessió 2026-11-24 · Llocs recomanats des del lloc de la sortida

## Objectiu

Provar l'app en local amb el token de Spotwise i corregir que el botó «Recomana» del formulari de sortida no donés cap local al centre de Barcelona.

## Què s'ha fet

- **Prova del token:** la crida directa a `GET /api/espais/?lat=41.3874&lon=2.1686` amb `Authorization: Token ...` va donar `200` i una llista d'espais de Barcelona.
- **Entorn local:** s'han omplert `infra/.env` i `backend/.env` (amb `NASA_API_KEY=DEMO_KEY`) i s'ha posat `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` a `frontend/.env` per provar la web al portàtil. Cap secret és al repositori ni al vault.
- **Diagnòstic:** el formulari buscava des de la ubicació del dispositiu (`useDeviceLocation`), que a la web pot caure lluny de Barcelona. La cerca filtra a 1.500 m, amb wifi i apte per a grups.
- **TG-661** (issue de tipus Bug, assignada a Raquel): `RecommendedPlaces` rep `near` i `LocationField` hi passa el lloc triat o, si no n'hi ha, el centre del mapa en prémer el botó. No demana el permís d'ubicació. Tests en vermell (`e81fd27c`) abans del canvi (`70b96541`) (ADR-0028).
- **Error de testing:** [[2026-11-24-tg-661-llocs-recomanats-des-del-dispositiu]] (`prova-manual`).

## Decisions preses

Cap ADR nova.

- **Origen de la cerca al formulari de sortida:** el lloc triat de la sortida o, si no, el centre del mapa (decisió de Raquel, 24/11/2026). La pantalla de punts de trobada d'un esdeveniment manté la ubicació del dispositiu.
- **El punt es fixa en prémer «Recomana»:** moure el mapa després no refà la cerca, perquè cada crida compta pel límit de Spotwise.

## Canvis al vault

- [[contracte-spotwise]], [[api]] i [[frontend]]: l'origen de la cerca depèn de la pantalla.
- Nota d'error de testing de TG-661.

## Pendent / següents passos

- [ ] Obrir la PR a `develop` quan Raquel ho demani (no s'ha fet push).
- [ ] Sense lloc triat i sense moure el mapa, la cerca surt del centre del món i dona una llista buida: decidir si cal avisar-ne.
- [ ] Una errada meva: `cp .env.example .env` va sobreescriure `infra/.env`; es va refer a partir de `backend/.env`.

## US de Taiga

- TG-661
- TG-352
