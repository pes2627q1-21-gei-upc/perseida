---
titol: "Contracte de serveis amb Spotwise"
tipus: guia
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "README.md (arrel), backend/README.md, incepció 2 §8"
etiquetes: [arquitectura, integracions, spotwise, contracte]
---

# Contracte de serveis amb Spotwise (grup 21B)

Perseida i Spotwise (aplicació de recomanació d'espais, grup 21B) s'integren en les dues direccions. El contracte es va acordar a l'Sprint 1.

## Servei proveït per Perseida

- `GET /api/events/active` i `GET /api/events/upcoming`: esdeveniments astronòmics rellevants actius en una data concreta o durant els dies vinents (pluges d'estrelles, eclipsis, superlluna, llançaments espacials).
- El JSON inclou metadades clau de cada fenomen: **títol**, **descripció breu** i **categoria** (p. ex. `lunar`, `solar`, `meteor_shower`).
- Ús per a Spotwise: personalitzar la seva interfície segons el context astronòmic (temes visuals, petites notificacions o pop-ups mentre cerquen locals).
- Les dades provenen de la base de dades de Perseida, alimentada per les APIs de la NASA i altres fonts ([[serveis-externs]]). L'endpoint el serveix l'[[api]].

## Servei consumit per Perseida

- La cerca i filtratge d'espais de Spotwise (biblioteques i cafeteries de Barcelona), basada en el «perfil de sessió»: ubicació, nivell de silenci, idoneïtat per a grups, Wi-Fi públic o endolls.
- Ús a Perseida: suggerir punts de trobada en organitzar esdeveniments astronòmics (cafeteries aptes per a «watch parties», biblioteques per a reunions d'estudi o preparació de sortides d'observació).

## Regla de canvis

> [!warning] Sprints 2-3
> Qualsevol canvi del contracte durant els Sprints 2 i 3 s'ha de **notificar i justificar**, perquè afecta els dos equips.

## Enllaços

- [[visio-general]], [[serveis-externs]], [[api]]
- [[epiques-i-us]]
