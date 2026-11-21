---
titol: "Sessió 2026-11-18 · Sortides al mapa i panell sense superposicions (TG-646, TG-647)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-52", "TG-646", "TG-647"]
font: "Taiga: TG-52, tasques TG-646 i TG-647; pla aprovat per Raquel (18/11/2026)"
etiquetes: [sessio, frontend, mapa, sortides]
---

# Sessió 2026-11-18 · Sortides al mapa i panell sense superposicions

## Objectiu

Posar les sortides al mapa d'esdeveniments (TG-646) i arreglar la posició dels controls i del panell lateral perquè no se superposin (TG-647). Branca `feature/TG-52-sortides-al-mapa`, creada des de `feature/TG-629-sortides-frontend`: no es pot fusionar fins que TG-629 estigui fusionada (si TG-629 canvia, cal fer rebase).

## Què s'ha fet

- TG-647, en TDD estricte: tests en vermell (`test:`) i després el codi (`feat:`). Controls a l'esquerra i compactes; fila amb la columna (capçalera, mapa, controls) i el panell com a germà; panell lateral amb `flex:1` i scroll intern; `ResizeObserver` que crida `invalidateSize()` al web.
- TG-646, també en TDD: marcador `kind: 'outing'` amb Binoculars i `pm-outing` (contrast de `brand` ≥ 3:1 als quatre temes, sense canviar cap color), filtre «Actius | Futurs | Sortides | Tots», fitxa `OutingSheetBody` dins la closca d'`EventSheet`, etiqueta accessible, avís als controls si fallen les sortides, claus i18n ca/es/en.
- Correcció d'un bug dels tests nous (`unmount()` sense `await`) en un commit `fix(test)`.
- Extra no demanat, a revisar: prop `fill` a `GlassPanel` (sense ella el scroll intern del panell lateral no té alçada) i extracció de `CloseButton` a `EventSheet`.
- No fet, com estava previst: transició animada del panell, sortides a la Llista, paginació.

## Decisions preses

Cap decisió d'arquitectura nova (cap ADR). Decisions menors d'implementació, sense cobertura al pla:

- Filtre «Sortides» mentre carreguen les sortides: estat de càrrega; amb esdeveniments en error però sortides carregades, les sortides es mostren.
- Vista Llista amb el filtre «Sortides»: tots els esdeveniments.
- Marcadors de sortida sense halo (`active` sempre fals).
- Al mòbil, el redimensionat el resol Leaflet escoltant el `resize` del WebView (no provat en dispositiu).

## Canvis al vault

- [[frontend]]: secció del mapa (filtre de 4 opcions, marcadors de sortida, fitxa de la sortida i disposició en pantalla ampla).

## Pendent / següents passos

- [ ] Provar el redimensionat del mapa al mòbil en un dispositiu real.
- [ ] Esperar que es fusioni TG-629 i fer rebase si cal abans d'obrir la PR cap a `develop`.
- [ ] Passar TG-646 i TG-647 a «Ready for test» a Taiga, amb confirmació de Raquel.

## US de Taiga

- TG-52, TG-646, TG-647
