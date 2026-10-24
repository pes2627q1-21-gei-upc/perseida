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

Nginx Proxy Manager amb la imatge oficial `jc21/nginx-proxy-manager:2.12.3` fixada al Docker Compose (`infra/docker-compose.yml`). Utilitza quatre volums amb nom: `npm_data` (`/data`) per a la configuració i SQLite, `npm_letsencrypt` (`/etc/letsencrypt`) per als certificats SSL, i en lectura `media_data` (`/media`, compartit amb l'[[api]]) i `admin_dist` (`/admin`, el panell d'administració compilat).

## Interfícies

- Qui el crida: l'app Android (HTTPS / WSS) i el navegador d'administració (SPA + REST), a `https://perseida.duckdns.org:40431` a producció.
- A qui crida: [[api]] (`proxy_pass`). Comparteix el volum de media amb l'API.
- Ports: publica `HTTP_PORT` i `HTTPS_PORT` (en local `80` i `443`; a producció `8080` i `8081`). El port d'administració `81` es publica només a `127.0.0.1`, tant en local com a producció (`infra/docker-compose.yml`, TG-89): no s'hi pot arribar des de fora, i a producció s'hi entra per túnel SSH (`ssh -L 8181:localhost:81 …`). Sense publicar-lo a `127.0.0.1`, el túnel no arribaria al contenidor.

> [!info] Producció a Virtech
> A Virtech no hi ha els ports 80 i 443 públics: es publiquen el `8080` i el `8081` (`40430` i `40431` des de fora) i el certificat s'obté amb el repte DNS-01 de DuckDNS ([[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]).

Un sol *proxy host* cap a `api:8000` amb aquestes rutes: `/api/...` (API), `/api/ws` (WebSocket del xat), `/media/` i `/admin/` (els serveix el mateix NPM). La configuració avançada es versiona a `infra/nginx-proxy-manager/` (`static.conf`, `websocket.conf`, `security-headers.conf`) i els passos per recrear-lo són a la secció «nginx-proxy-manager» del README d'`infra/`, perquè NPM desa els *proxy hosts* a la seva base de dades.

## Configuració

Variables a `.env.example`: `HTTP_PORT`, `HTTPS_PORT` i `NPM_ADMIN_PORT`. El token de DuckDNS i la contrasenya del panell no van a cap fitxer: només al panell d'NPM.

## Decisions relacionades

- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-89 (nginx-proxy-manager)
- TG-96 (pujada de media)

## Estat d'implementació

implementat (TG-89): en local i a producció. A producció, `/admin/` funcionarà quan la VM tingui el compose amb el volum `admin_dist` i el paquet de la TG-77.

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[frontend]]
- [[api]], [[moderation]]
