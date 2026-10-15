---
titol: "Client offline amb SQLite i last-write-wins"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-66"]
font: "incepció 2 §6 (02-10-2026); frontend/README.md; memòria §2.5.3; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, frontend, offline, sqlite, sincronitzacio]
---

# ADR-0011 · Client offline amb SQLite i last-write-wins

## Context

L'app mòbil ha de poder seguir funcionant sense connexió i sincronitzar-se més tard (incepció 2 §6, document del 02-10-2026). L'app es pensa per a Android i iOS, però de moment només es desplega Android.

## Decisió

L'app manté una base de dades local SQLite que fa de cua de sortida (outbox) i de cache de lectura. Els canvis es reenvien en recuperar la connexió i els conflictes es resolen amb la política last-write-wins.

## Conseqüències

### Positives

- L'app continua funcionant sense connexió.
- Segons l'estratègia de proves, els elements desats a la cua local es reenvien en ordre i sense duplicats en recuperar la connexió (verificat amb la capa SQLite simulada).

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-66 (cua offline SQLite i sincronització last-write-wins)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[frontend]]
- [[visio-general]]
- [[testing]]
- [[api]]
