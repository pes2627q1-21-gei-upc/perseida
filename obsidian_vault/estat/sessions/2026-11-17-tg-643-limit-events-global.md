---
titol: "Sessió 2026-11-17: activació del límit de peticions a producció i pujada del límit (TG-351, TG-643)"
tipus: sessio
estat: vigent
data: "2026-11-17"
us: ["TG-351", "TG-643"]
font: "CD de la release 0.2.0 i dels hotfixes 0.2.1 i 0.2.2; panell d'NPM i registre d'accessos de producció (17/11/2026); infra/scripts/test-rate-limit.sh; decisions de Raquel en aquesta sessió"
etiquetes: [sessio, infra, proxy, esdeveniments]
---

# Sessió 2026-11-17 · Límit de peticions a producció (TG-351, TG-643)

## Objectiu

Activar a producció el límit de peticions de `/api/events/` (TG-351, tasca #477) i comprovar que compta la IP del client.

## Què s'ha fet

- **Taiga:** tasca #479 tancada i TG-351 a `Done` (16/11/2026). Spotwise ja tenia l'avís del camp d'ubicació i les respostes d'exemple.
- **Activació:** després del CD verd del hotfix 0.2.2, `nginx -T` mostrava la zona `events_per_ip` i el `map` `$events_problem_instance`. Raquel va enganxar `rate-limit.conf` a la pestanya «Advanced» del proxy host i el host va continuar *Online*. Amb 30 peticions seguides, unes 24 donaven 200 i després 429 en problem+json (`RATE_LIMITED`, `instance`, `Retry-After: 1`, HSTS).
- **Troballa:** al registre d'accessos d'NPM totes les peticions arriben amb la mateixa IP privada (`10.x`), la del NAT de la UPC. El límit és un sol comptador per a tota l'app i per a Spotwise ([[nginx-proxy-manager#Límit de peticions (TG-351)]]). S'ha obert la issue TG-643.
- **Branca `feature/TG-643-limit-events-global`:**
  - `test-rate-limit.sh` exigeix una ràfega de 100 a 10 r/s (commit `test:` en vermell). La fase del 429 envia les peticions en paral·lel amb `curl -Z`: a 10 r/s, unes peticions seguides i lentes (Docker Desktop) no passaven mai del límit.
  - `http_top.conf` passa a `rate=10r/s` i `rate-limit.conf` a `burst=100`.
  - La clau de la zona passa de `$binary_remote_addr` a `$realip_remote_addr`. NPM es fia d'`X-Real-IP` des de xarxes privades i, darrere del NAT, tot ho és: amb la clau antiga, una `X-Real-IP` falsa a cada petició se saltava el límit. El test reprodueix la configuració *real IP* d'NPM i ho comprova (en vermell amb la clau antiga).
  - Descripció del 429 a l'OpenAPI (`router.py`, `openapi.json`, `schema.d.ts`), README d'`infra/` en tres idiomes, [[nginx-proxy-manager]] i [[contracte-spotwise]].
- **Review de la PR #100** (manelav, canvis demanats):
  - Crítica: en canviar la clau d'una zona viva, el `nginx -s reload` del CD falla sense que el pas surti en vermell, i producció es quedaria amb la clau i el ritme antics. Es documenta el reinici puntual del proxy al README d'`infra/` i a [[nginx-proxy-manager]].
  - El 429 de l'OpenAPI deixa de dir «per IP» i diu que el comptador és compartit. S'han regenerat `openapi.json` i `schema.d.ts`.
  - Textos «per IP» corregits a `rate-limit.conf`, als README d'`infra/`, a [[nginx-proxy-manager]] i a [[contracte-spotwise]].

## Decisions

Cap ADR nova. Decisions de Raquel:

- Pujar el límit a 600 per minut amb ràfega de 100 en lloc de demanar a Virtech que conservi la IP d'origen.
- Issue nova a Taiga (TG-643) en lloc de reobrir TG-351.
- Clau del límit `$realip_remote_addr`: no es pot falsejar, i el comptador ja era compartit.
- Activar la clau nova amb un `docker compose restart reverse-proxy` puntual, no reanomenant la zona en dues fases (review de la PR #100).
- Risc acceptat: un sol client a 10 r/s pot esgotar el comptador compartit de `/api/events/` (review de la PR #100).

## Pendent / següents passos

- [ ] PR de `feature/TG-643-limit-events-global` cap a `develop` quan Raquel ho demani.
- [ ] Després del desplegament: `docker compose restart reverse-proxy` (el reload no aplica la clau nova), comprovar `nginx -T | grep limit_req_zone` i `docker compose logs reverse-proxy`, i tornar a enganxar `rate-limit.conf` a «Advanced» (canvia la ràfega).
- [x] Confirmat a producció (`nginx -T | grep real_ip`): NPM té les tres xarxes privades, `real_ip_header X-Real-IP` i `real_ip_recursive on`, com el test. A més hi ha els rangs de CloudFront i Cloudflare (`ip_ranges.conf`), que no hi afecten perquè el trànsit arriba del NAT.
- [ ] Afegir el job `proxy` als *required checks* de `develop`.

## US de Taiga

- TG-351 (tasques #477 i #479)
- TG-643
