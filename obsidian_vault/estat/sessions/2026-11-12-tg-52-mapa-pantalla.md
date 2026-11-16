---
titol: "Sessió 2026-11-12: pantalla del mapa d'esdeveniments (TG-52, tasques #489-#492)"
tipus: sessio
estat: vigent
data: "2026-11-12"
us: ["TG-52"]
font: "Taiga: TG-52 i tasques #489-#492; decisions de Raquel en aquesta sessió (12/11/2026); proves a l'iPhone amb Expo Go"
etiquetes: [sessio, frontend, mapa, leaflet, esdeveniments]
---

# Sessió 2026-11-12 · Pantalla del mapa d'esdeveniments (TG-52)

## Objectiu

Fer les tasques 2/5 a 5/5 de TG-52 després de l'spike ([[2026-11-10-tg-52-spike-mapa]]): hooks de dades, pantalla i marcadors, filtre i fitxa, i estats, responsive i accessibilitat.

## Què s'ha fet

- **#489:** `useActiveEvents`, `useUpcomingEvents` i `useMapEvents` amb TanStack Query, i `classifyEvents`.
- **#490:** ruta `/(app)/map`, orbes de vidre per categoria amb halo als actius, vista de llista, barra superior i selector «Mapa | Llista» a baix; atribució del mapa més curta.
- **#491:** filtre «Actius | Futurs | Tots» i fitxa resum en tocar un marcador o una fila.
- **#492:** estats de càrrega, buit i error; la fitxa va al costat del mapa a partir de 768 px.
- TDD estricte a cada canvi ([[0028-tdd-estricte-i-politica-de-testing-avancada]]): cada `feat:` o `fix:` té el seu `test:` abans.
- Les tasques #490 i #491 s'han validat a l'iPhone amb Expo Go, amb esdeveniments de prova a la base de dades local (`external_id` amb el prefix `dev-tg52-`, per esborrar). La #492 també l'ha provada Raquel (càrrega, error i pantalla ampla).
- Detall de la pantalla a [[frontend#Mapa d'esdeveniments (TG-52)]].

## Decisions preses

Totes de Raquel:

- **Dades:** `staleTime` de 5 minuts i un reintent només si l'error és transitori; els esdeveniments sense ubicació es conserven a `classifyEvents`.
- **Dues vistes, Mapa i Llista.** El mapa només mostra els esdeveniments amb ubicació. Els que no en tenen surten a la llista amb «Visible des de qualsevol lloc». Es va provar una llista sota el mapa i es va treure per guanyar espai: s'ha reescrit el **criteri 4** de la US a Taiga.
- **Token nou** `duration.ambient` = 6 s (cicle del halo dels actius).
- **Ubicació a la llista:** coordenades. Proposta d'afegir el nom del lloc al contracte (`location.name`, Launch Library 2 ja el dona) en un comentari de TG-52; és un canvi de contracte amb Spotwise ([[contracte-esdeveniments]]) i no es fa dins de TG-52.
- **Disseny:** barra superior només amb tornar i títol; filtre i «Mapa | Llista» junts a baix; zoom de Leaflet a baix a la dreta; atribució curta damunt del mapa ([[0032-leaflet-per-al-mapa-web-i-webview]]).
- **Fitxa:** títol, categoria, inici i fi, descripció, lloc i enllaç a la font (només https). Al mòbil es tanca amb la X, tocant fora, Esc o el botó enrere, i el fons no s'enfosqueix (Raquel prefereix no afegir un token de vel). Fa servir el vidre normal, no el fort.
- **Estats:** panell de vidre damunt del mapa (el mapa es continua veient).
- **Taiga:** s'esborren les tasques de tests (#493) i de documentació (#494). Amb TDD els tests van dins de cada tasca, i el vault s'actualitza a cada PR (DoD). Les altres es reanomenen «N/5».

## Canvis al vault

- [[frontend]]: secció «Mapa d'esdeveniments (TG-52)».
- [[0032-leaflet-per-al-mapa-web-i-webview]]: atribució curta i marcadors propis. Era l'ADR-0031, però en fusionar `develop` aquest número ja era de [[0031-fonts-d-esdeveniments-sota-demanda]] (TG-50) i s'ha renumerat a 0032.

## Pendent / següents passos

- [ ] Treure abans de la PR: el botó «Mapa (dev)» de `login.tsx` i `src/app/dev-map.tsx` (no estan comitejats) i els esdeveniments `dev-tg52-*` de la base de dades local.
- [ ] Mutation testing (ADR-0028): Stryker no funciona amb `pnpm dlx` (no troba el plugin de Jest). Es deixa per a les US de CI #359-#362. Cobertura del codi de TG-52: 95 % de línies i 90 % de branques.
- [ ] Obrir la PR de TG-52 quan Raquel ho demani.

## US de Taiga

- TG-52
