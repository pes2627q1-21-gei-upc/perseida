---
titol: "Docker Compose en lloc de Kubernetes"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-37"]
font: "memòria §3.4.1; infra/README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, infra, docker-compose, desplegament]
---

# ADR-0002 · Docker Compose en lloc de Kubernetes

## Context

El sistema es desplega sobre un únic servidor proporcionat per Virtech, és a dir, un sol host físic (memòria §3.4.1). Cal orquestrar-hi cinc contenidors: nginx-proxy-manager, api, postgres, redis i moderation.

## Decisió

Tots els components s'orquestren amb Docker Compose, que permet declarar i desplegar tots els serveis amb un sol fitxer versionat, de forma reproduïble i senzilla d'entendre. El mateix Compose s'usa en local i en producció.

## Conseqüències

### Positives

- Un sol fitxer versionat declara tots els serveis, amb un desplegament reproduïble.
- No hi ha control plane ni l'overhead de memòria que comportaria un orquestrador.
- Els desenvolupadors executen el sistema en local amb el mateix Compose que a producció.

### Negatives (assumides)

- El servidor continua sent un punt únic de fallada.
- No hi ha escalat horitzontal ni còpies de seguretat automàtiques (limitació acceptada dins l'abast d'un projecte acadèmic).

## Alternatives descartades

- Kubernetes: descartat explícitament; amb un sol host físic un orquestrador afegeix un control plane i overhead de memòria sense aportar cap benefici real, ja que el punt únic de fallada continua sent el servidor mateix.

## US de Taiga relacionades

- TG-37 (Docker Compose amb els cinc serveis)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[arquitectura-fisica]]
- [[visio-general]]
- [[0003-un-sol-proces-fastapi]]
- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
