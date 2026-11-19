---
titol: "Component: nginx-proxy-manager"
tipus: component
estat: vigent
data: "2026-11-19"
us: ["TG-85", "TG-37", "TG-89", "TG-96", "TG-38", "TG-63", "TG-351", "TG-643", "TG-51"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6; infra/docker-compose.yml (TG-37, TG-89); infra/nginx-proxy-manager/rate-limit.conf (TG-351, tasca #477); review de la PR #83 (16/11/2026); review de la PR #100 (17/11/2026); TG-51 (19/11/2026)"
etiquetes: [component, nginx-proxy-manager, proxy, tls]
---

# nginx-proxy-manager

## Responsabilitat

Punt d'entrada únic del sistema. Termina HTTPS/TLS (certificats gestionats), reenvia el trànsit a l'[[api]] (`proxy_pass`), gestiona l'upgrade de connexió perquè el WebSocket del xat travessi el proxy, i serveix directament els fitxers multimèdia dels usuaris (des del volum compartit) i el bundle estàtic del panell d'administració. També limita les peticions als endpoints públics d'esdeveniments (`/api/events/`). Així no s'exposen els contenidors interns ni cal un servei extern d'emmagatzematge d'objectes. No executa lògica de negoci.

## Tecnologia i versió

Nginx Proxy Manager amb la imatge oficial `jc21/nginx-proxy-manager:2.12.3` fixada al Docker Compose (`infra/docker-compose.yml`). Utilitza quatre volums amb nom: `npm_data` (`/data`) per a la configuració i SQLite, `npm_letsencrypt` (`/etc/letsencrypt`) per als certificats SSL, i en lectura `media_data` (`/media`, compartit amb l'[[api]]) i `admin_dist` (`/admin`, el panell d'administració compilat).

## Interfícies

- Qui el crida: l'app Android (HTTPS / WSS) i el navegador d'administració (SPA + REST), a `https://perseida.duckdns.org:40431` a producció.
- A qui crida: [[api]] (`proxy_pass`). Comparteix el volum de media amb l'API.
- Ports: publica `HTTP_PORT` i `HTTPS_PORT` (en local `80` i `443`; a producció `8080` i `8081`). El port d'administració `81` es publica només a `127.0.0.1`, tant en local com a producció (`infra/docker-compose.yml`, TG-89): no s'hi pot arribar des de fora, i a producció s'hi entra per túnel SSH (`ssh -L 8181:localhost:81 …`). Sense publicar-lo a `127.0.0.1`, el túnel no arribaria al contenidor.

> [!info] Producció a Virtech
> A Virtech no hi ha els ports 80 i 443 públics: es publiquen el `8080` i el `8081` (`40430` i `40431` des de fora) i el certificat s'obté amb el repte DNS-01 de DuckDNS ([[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]).

Un sol *proxy host* cap a `api:8000` amb aquestes rutes: `/api/...` (API), `/api/ws` (WebSocket del xat), `/api/events/` (API amb límit de peticions), `/media/` i `/admin/` (els serveix el mateix NPM). La configuració avançada es versiona a `infra/nginx-proxy-manager/` (`static.conf`, `websocket.conf`, `security-headers.conf`, `rate-limit.conf`) i els passos per recrear-lo són a la secció «nginx-proxy-manager» del README d'`infra/`, perquè NPM desa els *proxy hosts* a la seva base de dades.

## Límit de peticions (TG-351)

- `/api/events/` admet 600 peticions per minut (10 per segon) entre tots els clients, amb una ràfega de 100 servida de cop (decisió de Raquel, tasca #477; pujat des de 60 per minut i ràfega de 20 a TG-643). Per sobre, el proxy respon `429` en problem+json amb `code: RATE_LIMITED`, `instance` i `Retry-After: 1` ([[0018-errors-rfc-9457-amb-codis-estables]]), sense arribar a l'[[api]]. L'OpenAPI dels dos endpoints documenta aquest 429.
- El bloc és `location ^~ /api/events`, sense barra final (TG-51): així el llistat filtrable `GET /api/events` comparteix el límit; amb `/api/events/` nginx hi responia un 301 cap a `/api/events/`. En desplegar-ho cal tornar a enganxar `rate-limit.conf` a l'Advanced del *proxy host* (README d'`infra/`).
- `instance` surt d'un `map` d'`http_top.conf`: el camí exacte per a `/api/events`, `/api/events/active` i `/api/events/upcoming`, i `/api/events/` per a qualsevol altre. nginx no escapa JSON, així que `$uri` mai entra al cos (review de la PR #83).
- La zona `limit_req_zone` ha d'anar al bloc `http`, on la pestanya «Advanced» no arriba: és a `http_top.conf`, que el Compose munta a `/data/nginx/custom/http_top.conf` (NPM l'inclou; sense `:ro`, perquè en arrencar NPM fa `chown` de tot `/data` i amb un fitxer de només lectura no arrenca, hotfix 0.2.1) i el CD copia al servidor amb `install-http-top.sh`, que l'escriu amb un contenidor d'un sol ús de la imatge d'NPM (estigui el proxy en marxa o no) si el `chown` d'arrencada l'ha fet de root (hotfix 0.2.2). La ubicació és a `rate-limit.conf`.
- Ho comprova `infra/scripts/test-rate-limit.sh`, al job `proxy` de la CI. `infra/scripts/test-npm-startup.sh` arrenca la imatge real d'NPM amb el muntatge del Compose (regressió del hotfix 0.2.1: amb `:ro`, NPM no arrencava); el job també s'executa quan canvia `infra/docker-compose.yml`.

> [!danger] Ordre d'activació i de retirada
> `rate-limit.conf` necessita la zona i el `map` d'`http_top.conf`; sense, nginx no arrenca i cau tot el proxy host. Per activar-lo, primer es desplega i després s'enganxa `rate-limit.conf` a «Advanced». Per retirar-lo (o abans d'un revert que tregui el muntatge), primer s'esborra d'«Advanced» i després es desplega. Detall a la secció «Límit de peticions» del README d'`infra/`.
>
> **Si canvia la clau de la zona** (`$binary_remote_addr` → `$realip_remote_addr` a TG-643, o el revert d'aquest canvi), el reload no l'aplica. nginx rebutja la zona viva amb una clau diferent i es queda amb la configuració antiga. El pas del CD surt verd igualment, perquè `nginx -t` no compara amb la zona viva i `nginx -s reload` només envia el senyal. Tampoc s'aplica cap desat d'«Advanced». Després d'aquest desplegament cal `docker compose restart reverse-proxy` (uns segons de tall). Es comprova amb `nginx -T | grep limit_req_zone` i amb `docker compose logs reverse-proxy`, i només després es torna a enganxar `rate-limit.conf` (decisió de Raquel, review de la PR #100).

> [!info] Tots els clients comparteixen el comptador (TG-643)
> A producció el NAT de la UPC (`nattech.fib.upc.edu`) fa SNAT: totes les peticions arriben a NPM amb la mateixa IP privada (`10.x`), comprovat al registre d'accessos el 17/11/2026. El límit és, per tant, un sol comptador per a tota l'app i per a Spotwise. Amb el límit inicial (60 per minut, ràfega de 20) unes 10 persones obrint el mapa alhora (2 peticions cadascuna) ja rebien 429; per això es va pujar a 600 per minut amb ràfega de 100 (decisió de Raquel, 17/11/2026). Si el NAT arribés a conservar la IP d'origen, es podria tornar a un límit per IP més estricte.
>
> Risc acceptat per Raquel (17/11/2026, review de la PR #100): un sol client a 10 peticions per segon sostingudes (un bucle de `curl` n'hi ha prou) gasta tot el comptador i deixa sense esdeveniments tota l'app i Spotwise. Darrere del NAT el proxy no pot distingir els clients, cap ús legítim s'hi acosta (el mapa fa unes 2 peticions per persona i Spotwise unes 2 per hora) i només afecta `/api/events/`: la resta de l'API continua disponible.

> [!warning] IP real del client
> NPM confia en `X-Real-IP` quan la petició arriba de `10/8`, `172.16/12` o `192.168/16`. El NAT de la UPC reescriu l'origen a una IP privada (vegeu el requadre anterior), així que amb `$remote_addr` com a clau un client podria enviar una `X-Real-IP` diferent a cada petició i saltar-se el límit. Per això la clau és `$realip_remote_addr`, l'adreça de la connexió, que no es pot falsejar (decisió de Raquel, 17/11/2026, TG-643). `test-rate-limit.sh` reprodueix la confiança d'NPM en `X-Real-IP` i ho comprova.

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
- TG-351 (límit de peticions per IP als endpoints d'esdeveniments, tasca #477)

## Estat d'implementació

implementat (TG-89): en local i a producció. A producció, `/admin/` funcionarà quan la VM tingui el compose amb el volum `admin_dist` i el paquet de la TG-77.

`/api/ws` ja té endpoint (TG-63): amb `websocket.conf` el handshake arriba a l'API i dona `101 Switching Protocols`. El primer frame ha de ser `auth` i el `proxy_read_timeout` de 3600 s és molt superior al heartbeat de l'app (30 s). Vegeu [[0030-protocol-websocket-i-revocacio-per-pub-sub]].

> [!warning] El panell es serveix a `/admin/`
> L'export web d'Expo ha de tenir `experiments.baseUrl: "/admin"` a `frontend/app.json` (TG-77). Sense això, el paquet demana `/_expo/static/...` des de l'arrel, que va a l'API i dona 404.

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[frontend]]
- [[api]], [[moderation]]
