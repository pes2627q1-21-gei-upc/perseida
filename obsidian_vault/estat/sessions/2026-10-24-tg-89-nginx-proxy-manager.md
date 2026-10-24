---
titol: "Sessió 2026-10-24: nginx-proxy-manager com a punt d'entrada HTTPS (TG-89)"
tipus: sessio
estat: vigent
data: "2026-10-24"
us: ["TG-89", "TG-38"]
font: "US TG-89 i tasques #187–#193 i #326 de Taiga; infra/docker-compose.yml, infra/nginx-proxy-manager/, infra/README*.md; verificació en local i a producció del 2026-10-24"
etiquetes: [sessio, devops, nginx-proxy-manager, https, websocket, duckdns, tg-89]
---

# Sessió 2026-10-24 · nginx-proxy-manager com a punt d'entrada HTTPS (TG-89)

## Objectiu

Implementar la US TG-89: [[nginx-proxy-manager]] com a únic punt d'entrada HTTPS, amb upgrade de WebSocket, servei directe de la multimèdia i del panell d'administració, configuració reproduïble i el certificat de producció a Virtech (tasca #326).

## Què s'ha fet

1. **Compose (#187, #188):**
   - Volum nomenat `admin_dist` (`perseida_admin_dist`) muntat al `reverse-proxy` en lectura a `/admin`, com `media_data` a `/media`.
   - Port 81 del panell d'NPM publicat només a `127.0.0.1`, també a producció (abans només a l'override local), perquè el túnel `ssh -L 8181:localhost:81` hi pugui arribar.
2. **Configuració avançada versionada a `infra/nginx-proxy-manager/` (#190, #191):**
   - `static.conf`: `location /media/` (CSP `sandbox`, `nosniff`, CORP, cache d'1 h) i `location /admin/` (fallback de SPA amb `try_files` i CSP estricta). Les capçaleres del panell i de la multimèdia s'hi han mogut des de `security-headers.conf`, que ara només té l'HSTS de l'API.
   - `websocket.conf`: `location /api/ws` amb upgrade, capçaleres `X-Forwarded-*` i `proxy_read_timeout` de 3600 s, cap a `$forward_scheme://$server:$port` (les variables del proxy host).
3. **README d'`infra/` en tres idiomes (#192):** secció «nginx-proxy-manager» amb les rutes, els ports local i de producció, el túnel al panell, el certificat (autosignat en local, DNS-01 de DuckDNS a producció), els passos del proxy host, les comprovacions i el perquè dels volums.
4. **Local (#189, #193):** Docker Desktop instal·lat; stack aixecat i proxy host creat per l'API d'NPM.
5. **Producció (#326):**
   - Registre A de `perseida.duckdns.org` corregit: apuntava a una IP domèstica i ara apunta a `147.83.148.217`.
   - Panell d'NPM per un túnel puntual a la IP del contenidor (el compose nou encara no és a la VM).
   - Credencials per defecte substituïdes, certificat Let's Encrypt per DNS-01 i proxy host creats amb un script que demana el token i la contrasenya sense mostrar-los.

## Verificació

| Criteri | Local (`perseida.localhost`) | Producció (`perseida.duckdns.org:40431`, des de fora de la UPC) |
|---|---|---|
| 2 Punt únic | `docker compose config`: només NPM publica ports | `docker ps` a la VM: només NPM |
| 3 Panell | 81 tancat des de la IP de xarxa, obert a `127.0.0.1` | 81 tancat des de fora |
| 4 HTTPS | 301 cap a HTTPS, HTTP/2 | Certificat de Let's Encrypt vàlid sense `-k`, HTTP/2 |
| 5 API | `/api/health` 200 pel proxy | `/api/health` i `/api/docs` 200 |
| 6 WebSocket | 101 amb un eco temporal i el mateix `websocket.conf`; oberta després de 75 s inactiva | El handshake arriba a l'API (404 fins a la TG-63) |
| 7 Media | 200 amb `sandbox` i `nosniff`; 404 per a inexistents i *traversal* | Servit per nginx amb CSP `sandbox` |
| 8 Admin | 200 i fallback de SPA amb la CSP estricta | Pendent del deploy (volum `admin_dist`) i de la TG-77 |
| 9 Reproduïble | Les ordres del README funcionen tal qual | — |

També: `nginx -t` correcte en local i a la VM; `actionlint` sense errors.

**Revisió (`reviewer-arquitectura`):** cap troballa crítica ni alta. Aplicat: `^~` a `/media/` i `/admin/` (perquè l'opció *Cache Assets* d'NPM no els desviï a l'API), redirecció relativa de `/admin` a `/admin/` (una absoluta perdria el port del NAT), `Cache-Control: no-cache` al panell, `frame-ancestors 'none'` a la multimèdia, comentari de `NPM_ADMIN_PORT` a `.env.example` i diagrames dels README amb el port de producció. Provat en un nginx temporal amb els mateixos `.conf`. Descartat: l'HSTS duplicat (només n'arriba un, comprovat en local i a producció) i `location = /api/ws` (la TG-63 pot afegir subcamins).

## Decisions preses

- Producció per ports NAT, DuckDNS i certificat DNS-01, i panell a `127.0.0.1` amb túnel SSH: [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] (proposada).
- Camí del WebSocket: `/api/ws` (confirmat per la persona responsable).
- Un sol proxy host per a API, WebSocket, multimèdia i panell; capçaleres dins de cada `location` de `static.conf`.
- Domini local `perseida.localhost`: el `default.conf` d'NPM reserva `server_name localhost` al 443 amb `ssl_reject_handshake`.

## Canvis al vault

- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] (nova) i [[00-index]].
- [[arquitectura-fisica]] i [[visio-general]]: fora l'avís «HTTPS pendent de decidir»; diagrames amb `:40431`.
- [[nginx-proxy-manager]]: volums, rutes, ports, configuració i estat «implementat».
- [[seguretat]] i [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]]: les capçaleres del panell i de la multimèdia són a `static.conf`.

## Pendent / següents passos

- [ ] PR cap a `develop`, aprovació d'una altra persona i CI en verd; després, US a `Done`.
- [ ] Pas 8 de la #326: comprovar si Google OAuth accepta `perseida.duckdns.org` com a domini autoritzat i dir-ho a qui gestiona el client OAuth.
- [ ] Després del deploy a `main`: comprovar `127.0.0.1:81->81` a la VM, el túnel fix i el volum `admin_dist`; `/admin/` a producció quan la TG-77 hi posi el paquet.
- [ ] Aturar qualsevol client d'actualització automàtica de DuckDNS que no fixi `ip=147.83.148.217`.
- [ ] La URL base de l'API de l'app a producció ha d'incloure el port `:40431`.
- [ ] TG-77: `experiments.baseUrl: "/admin"` a l'export web d'Expo perquè el panell funcioni a `/admin/`.
- [ ] ADR-0026 passa a `acceptada` quan l'equip l'aprovi a la PR.

## US de Taiga

- TG-89 (tasques #187–#193 i #326)
- TG-38 (ports NAT de producció)
