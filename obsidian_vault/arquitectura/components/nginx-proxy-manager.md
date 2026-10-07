---
titol: "Component: nginx-proxy-manager"
tipus: component
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-37", "TG-89", "TG-96"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6"
etiquetes: [component, nginx-proxy-manager, proxy, tls]
---

# nginx-proxy-manager

## Responsabilitat

Punt d'entrada únic del sistema. Termina HTTPS/TLS (certificats gestionats), reenvia el trànsit a l'[[api]] (`proxy_pass`), gestiona l'upgrade de connexió perquè el WebSocket del xat travessi el proxy, i serveix directament els fitxers multimèdia dels usuaris (des del volum compartit) i el bundle estàtic del panell d'administració. Així no s'exposen els contenidors interns ni cal un servei extern d'emmagatzematge d'objectes. No executa lògica de negoci.

## Tecnologia i versió

Nginx Proxy Manager. La versió concreta no consta als documents consultats. La seva configuració viurà a `infra/nginx-proxy-manager/` (estructura planificada).

## Interfícies

- Qui el crida: l'app Android (HTTPS 443 / WSS) i el navegador d'administració (SPA + REST).
- A qui crida: [[api]] (`proxy_pass`). Comparteix el volum de media amb l'API.

## Configuració

Veure `.env.example`; no hi apareix cap variable específica d'aquest servei.

## Decisions relacionades

- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-89 (nginx-proxy-manager)
- TG-96 (pujada de media)

## Estat d'implementació

planificat

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[frontend]]
- [[api]], [[moderation]]
