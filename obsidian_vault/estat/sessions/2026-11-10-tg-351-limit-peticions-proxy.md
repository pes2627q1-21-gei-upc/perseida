---
titol: "Sessió 2026-11-10: límit de peticions per IP al proxy (TG-351, tasca #477)"
tipus: sessio
estat: vigent
data: "2026-11-10"
us: ["TG-351"]
font: "Taiga: TG-351 i tasca #477; decisions de Raquel en aquesta sessió (10/11/2026); nginx.conf d'NPM v2.12.3 (include de /data/nginx/custom/http_top.conf)"
etiquetes: [sessio, infra, nginx-proxy-manager, seguretat, spotwise]
---

# Sessió 2026-11-10 · Límit de peticions per IP al proxy (TG-351)

## Objectiu

Fer la tasca 4/6 de TG-351 (#477): que [[nginx-proxy-manager]] limiti les peticions per IP als endpoints públics `/api/events/active` i `/api/events/upcoming` (meitat pendent del criteri 5).

## Què s'ha fet

- `infra/nginx-proxy-manager/http_top.conf`: zona `events_per_ip` (1 r/s per IP) al bloc `http`.
- `infra/nginx-proxy-manager/rate-limit.conf`: `location ^~ /api/events/` amb ràfega de 20 sense espera i un 429 en problem+json (`RATE_LIMITED`, `Retry-After: 1`, `X-Correlation-ID`, HSTS). S'enganxa a la pestanya «Advanced».
- `infra/docker-compose.yml` munta `http_top.conf` a `/data/nginx/custom/http_top.conf`, i `cd.yml` el copia a `/opt/perseida/nginx-proxy-manager/`.
- Test `infra/scripts/test-rate-limit.sh` i job `proxy` a la CI. Primer els commits `test:` en vermell i després el `feat:` ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).
- Codi `RATE_LIMITED` al catàleg de `gestio-errors`; README d'`infra/` (ca, es, en), [[nginx-proxy-manager]] i [[contracte-spotwise]].

## Decisions preses

Cap ADR nova (configuració del proxy dins de [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]). Totes les decisions són de Raquel:

- **Límit:** 60 peticions per minut i IP, ràfega de 20 sense espera, només a `/api/events/`.
- **Resposta:** 429 en problem+json amb `RATE_LIMITED` i `Retry-After` ([[0018-errors-rfc-9457-amb-codis-estables]]). Textos ca/es/en aprovats.
- **Desplegament de la zona:** muntatge al Compose i còpia al CD, en lloc d'una còpia manual al volum `npm_data`.
- **Evidència:** script de test amb nginx i un upstream de prova, executat a la CI.

## Revisió d'arquitectura

Sense troballes crítiques. Aplicades: el CD valida i recarrega nginx després de desplegar, el test inclou totes les confs d'«Advanced» i comprova l'HSTS del 200, i el 429 porta `Cache-Control: no-store` i es registra a nivell `warn`. Oberta (ALTA, no bloqueja la fusió però sí el tancament del criteri 5): la IP real del client a producció.

## Pendents

- Mirar `$realip_remote_addr` al registre d'NPM a producció. Si és privada, decidir: acceptar el risc, usar-la com a clau (sense spoofing, però amb comptador compartit si hi ha SNAT) o demanar a Virtech que conservi la IP d'origen.
- Afegir el job `proxy` als *required checks* de `develop`.
- L'HSTS de la resta de `/api/*` es perd perquè el `location /` d'NPM fa `add_header X-Served-By` (preexistent, fora d'abast): obrir una incidència.

- Enganxar `rate-limit.conf` a la pestanya «Advanced» del proxy host de producció.
- Comprovar al registre d'NPM que `$remote_addr` és la IP pública del client (vegeu l'avís a [[nginx-proxy-manager]]).
- Tasques #478 (proves d'integració contra el format de Spotwise) i #479 (comunicació a Spotwise, que ha de conèixer el límit).
