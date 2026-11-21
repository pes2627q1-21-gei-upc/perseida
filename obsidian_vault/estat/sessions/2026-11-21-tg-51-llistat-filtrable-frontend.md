---
titol: "Sessió 2026-11-21: llistat filtrable d'esdeveniments, app (TG-51, PR 2 de 2)"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-51"]
font: "Taiga: TG-51 i tasques #552 a #555; decisions de Manel (21/11/2026); revisió de reviewer-arquitectura sobre el diff"
etiquetes: [sessio, frontend, esdeveniments, accessibilitat]
---

# Sessió 2026-11-21 · Llistat filtrable d'esdeveniments, app (TG-51)

## Objectiu

Deixar a punt la PR 2 de 2 de TG-51: la pestanya Esdeveniments amb el llistat de `GET /api/events` i els filtres de categoria, període i «A prop meu». La PR està apilada sobre la PR 1 (#129, backend).

## Què s'ha fet

- **Dades:** `searchRange` i `searchEvents` (`GET /api/events`) i el hook `useEventSearch`, amb la clau `eventKeys.search(filtres)` i `keepPreviousData`.
- **Ubicació:** `useDeviceLocation` amb `expo-location`, que ja era una dependència des de TG-629. Té dos estats d'error:
  - `denied`: interruptor desactivat. Es torna a comprovar el permís quan l'app torna a primer pla.
  - `unavailable`: interruptor apagat, però es pot tornar a provar.
- **Pantalla:** `EventsScreen` substitueix el «Pròximament» de la pestanya:
  - xips de categoria (`GelChip`, component compartit nou);
  - `GelSegmented` de 7, 30 o 90 dies;
  - interruptor «A prop meu»;
  - distància haversine al client (`distanceKm`);
  - estats de càrrega, buit i error amb reintent;
  - recompte de resultats anunciat (regió viva `polite`, i `announceForAccessibility` a iOS).
- **Revisió d'arquitectura**, corregida amb TDD:
  - anunci a iOS;
  - contrast de l'interruptor als quatre temes (WCAG 1.4.11);
  - files sense `BlurView`;
  - llista ocupada i sense distàncies mentre arriben els resultats de filtres nous;
  - `unavailable` separat de `denied`, amb recuperació del permís;
  - la regla «actiu ara» i `utcDay`, en una sola còpia a `classifyEvents.ts`.

## Decisions preses

Totes són de Manel, del 21/11/2026, i cap no necessita ADR: són decisions de presentació dins de [[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020]].

- **Distància:** es calcula al client, perquè la resposta no la porta.
- **Període i radi:** rangs predefinits en lloc de selectors de data, i radi fix de 500 km.
- **Categories:** selecció múltiple; si no n'hi ha cap de marcada, es mostren totes.
- **«Actiu ara»:** es manté al client com a lògica de presentació, a `classifyEvents.ts` (`statusOn`), amb la mateixa regla que `GET /api/events/active`.
- **Anunci dels resultats:** `polite` a totes les plataformes.
- **Interruptor:** pista apagada amb `text.secondary` i polze `surface.glassSolid` quan està apagat, perquè arribi a 3:1 als temes posta i nit.

## Canvis al vault

- [[frontend]]: secció «Llistat filtrable d'esdeveniments (TG-51)» i la pestanya `events` a la taula de navegació.
- [[contracte-esdeveniments]]: com fa servir l'app `GET /api/events`.

## Pendent / següents passos

- [ ] Quan es fusioni la #129: rebasar aquesta branca sobre `develop` (`git rebase --onto origin/develop <head de la #129>`) i canviar la base de la PR.
- [ ] Prova manual en un dispositiu real (permís d'ubicació i lector de pantalla).

## US de Taiga

- TG-51
