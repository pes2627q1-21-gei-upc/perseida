---
titol: "nginx-proxy-manager serveix el media i la SPA d'admin"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-89", "TG-96"]
font: "memòria §3.4.1; infra/README.md; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, nginx-proxy-manager, tls, media, infra]
---

# ADR-0009 · nginx-proxy-manager serveix el media i la SPA d'admin

## Context

Cal un punt d'entrada únic al sistema que gestioni HTTPS i l'upgrade de connexió perquè el WebSocket del xat travessi el proxy. Els usuaris pugen fitxers multimèdia i el panell d'administració és un paquet estàtic (memòria §3.4.1).

## Decisió

nginx-proxy-manager és el punt d'entrada únic: termina HTTPS (certificats TLS gestionats automàticament), reenvia les peticions al backend i gestiona l'upgrade WebSocket. A més serveix directament els fitxers multimèdia pujats pels usuaris des d'un volum compartit del disc i el paquet estàtic del panell d'administració.

## Conseqüències

### Positives

- No s'exposen directament els contenidors interns.
- No cal dependre d'un servei extern d'emmagatzematge d'objectes.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- Servei extern d'emmagatzematge d'objectes per als fitxers multimèdia: descartat per no dependre d'un servei extern.

## US de Taiga relacionades

- TG-89 (nginx-proxy-manager)
- TG-96 (pujada de fitxers multimèdia a volum local servits per nginx-proxy-manager)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[nginx-proxy-manager]]
- [[arquitectura-fisica]]
- [[frontend]]
- [[api]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]
