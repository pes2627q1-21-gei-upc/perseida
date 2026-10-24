---
titol: "Component: nginx-proxy-manager"
tipus: component
estat: vigent
data: "2026-10-24"
us: ["TG-85", "TG-37", "TG-89", "TG-96", "TG-38"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6; infra/docker-compose.yml (TG-37, TG-89)"
etiquetes: [component, nginx-proxy-manager, proxy, tls]
---

# nginx-proxy-manager

## Responsabilitat

Punt d'entrada únic del sistema. Termina HTTPS/TLS (certificats gestionats), reenvia el trànsit a l'[[api]] (`proxy_pass`), gestiona l'upgrade de connexió perquè el WebSocket del xat travessi el proxy, i serveix directament els fitxers multimèdia dels usuaris (des del volum compartit) i el bundle estàtic del panell d'administració. Així no s'exposen els contenidors interns ni cal un servei extern d'emmagatzematge d'objectes. No executa lògica de negoci.

## Tecnologia i versió

Nginx Proxy Manager amb la imatge oficial `jc21/nginx-proxy-manager:2.12.3` fixada al Docker Compose (`infra/docker-compose.yml`). Utilitza dos volums amb nom persistents: `npm_data` (`/data`) per a la configuració i SQLite, i `npm_letsencrypt` (`/etc/letsencrypt`) per als certificats SSL.

## Interfícies

- Qui el crida: l'app Android (HTTPS 443 / WSS) i el navegador d'administració (SPA + REST).
- A qui crida: [[api]] (`proxy_pass`). Comparteix el volum de media amb l'API.
- Ports: publica `HTTP_PORT` i `HTTPS_PORT` (en local `80` i `443`; a producció `8080` i `8081`). El port d'administració `81` es publica només a `127.0.0.1`, tant en local com a producció (`infra/docker-compose.yml`, TG-89): no s'hi pot arribar des de fora, i a producció s'hi entra per túnel SSH (`ssh -L 8181:localhost:81 …`). Sense publicar-lo a `127.0.0.1`, el túnel no arribaria al contenidor.

> [!warning] Port 443 a Virtech
> A Virtech només hi ha ports públics NAT (`40430`–`40439`, dels quals el `40439` és SSH); no hi ha 80/443 públics. Com s'exposa aquest servei i com s'obté el certificat TLS és encara una decisió pendent; vegeu [[arquitectura-fisica]].

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
