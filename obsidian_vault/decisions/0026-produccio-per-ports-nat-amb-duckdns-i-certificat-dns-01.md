---
titol: "Producció per ports NAT amb DuckDNS i certificat DNS-01"
tipus: adr
estat: acceptada
data: "2026-10-25"
us: ["TG-89", "TG-38"]
font: "Taiga: TG-89 (nota «Producció a Virtech», decidit 2026-10-22) i tasca #326 (passos i comentari de verificació del 2026-10-24); infra/docker-compose.yml i infra/nginx-proxy-manager/ (TG-89); acceptada amb l'aprovació de la PR #48 (2026-10-24)"
etiquetes: [adr, infra, nginx-proxy-manager, tls, https, duckdns, virtech]
---

# ADR-0026 · Producció per ports NAT amb DuckDNS i certificat DNS-01

## Context

[[nginx-proxy-manager]] és el punt d'entrada HTTPS únic ([[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]) i la US TG-89 demana un certificat TLS vàlid gestionat automàticament. A la VM de Virtech no hi ha els ports 80 i 443 públics: l'únic accés des d'Internet és pel NAT compartit `nattech.fib.upc.edu`, ports `40430`–`40439`, que apunten als `8080`–`8089` de la VM; el `8089` és d'SSH ([[arquitectura-fisica]]). Sense el 80 no es pot fer el repte HTTP-01 de Let's Encrypt, i sense el 443 tampoc el TLS-ALPN-01. El projecte no té domini propi.

## Decisió

- **Ports:** nginx-proxy-manager publica `HTTP_PORT=8080` i `HTTPS_PORT=8081` a producció (variables de GitHub Actions), que des de fora són el `40430` i el `40431`. En local continuen sent el 80 i el 443.
- **Domini:** subdomini gratuït `perseida.duckdns.org`, amb registre A a `147.83.148.217` (la IP del NAT). L'URL pública és `https://perseida.duckdns.org:40431`.
- **Certificat:** Let's Encrypt amb el repte **DNS-01** i el proveïdor **DuckDNS**, que la versió fixada (2.12.3) ja porta. El token de DuckDNS només s'escriu al panell d'NPM de producció i es desa al seu volum; no va al repositori, a Taiga ni a GitHub. NPM renova el certificat sol.
- **Un sol proxy host** cap a `api:8000` per a l'API, el WebSocket (`/api/ws`), la multimèdia (`/media/`) i el panell (`/admin/`), tots al mateix origen. La configuració avançada es versiona a `infra/nginx-proxy-manager/` i els passos per recrear-lo són al README d'`infra/`.
- **Panell d'NPM (port 81):** es publica només a `127.0.0.1` també a producció i s'hi entra per túnel SSH (`ssh -L 8181:localhost:81 …`). Decidit el 2026-10-24: sense publicar-lo, el túnel cap a `localhost:81` no arriba al contenidor.

## Conseqüències

### Positives

- Certificat vàlid i renovat automàticament sense els ports 80 i 443, verificat des de fora de la UPC sense `-k` (comentari de la #326).
- Cap secret nou a GitHub ni variable nova al `.env`.
- API, WebSocket, panell i multimèdia comparteixen origen: la CSP del panell pot fer servir `connect-src 'self'`.
- El panell d'NPM no s'obre mai des de fora: només escolta a `127.0.0.1` i el NAT no publica el 81.

### Negatives (assumides)

- El port forma part de l'URL (`:40431`), també a la configuració de l'app (URL base de l'API).
- *Force SSL* redirigeix `http://…:40430` a `https://…` sense port, al 443, que el NAT no obre. Cal fer servir directament l'URL HTTPS; ho avisa el README d'`infra/`.
- La IP del NAT és compartida i pot canviar; si canvia, cal actualitzar el registre A a DuckDNS a mà.
- El token de DuckDNS dona control sobre el domini. El 2026-10-24 el registre apuntava a una IP domèstica (una actualització sense el paràmetre `ip`) i es va haver de corregir; qualsevol client d'actualització automàtica de DuckDNS l'hauria de fixar a `147.83.148.217`.
- DuckDNS és un servei gratuït de tercers, sense garanties. La VM i el domini deixen de servir al final del quadrimestre.
- Google OAuth (pas 8 de la #326): `duckdns.org` és a la [Public Suffix List](https://publicsuffix.org/list/), de manera que `perseida.duckdns.org` es pot afegir com a domini autoritzat. L'app Android no el necessita (torna per l'enllaç profund `perseida://`); el client web del panell sí, amb l'origen `https://perseida.duckdns.org:40431`. Cal registrar-lo a Google Cloud qui gestioni el client OAuth (TG-43).

## Alternatives descartades

- **Repte HTTP-01 o TLS-ALPN-01:** necessiten els ports 80 o 443 públics, que Virtech no ofereix.
- **Certificat autosignat a producció:** l'app i els navegadors el rebutjarien o mostrarien un avís; el criteri 4 de TG-89 demana un certificat vàlid.
- **Panell d'NPM sense publicar, amb túnel a la IP interna del contenidor:** funciona, però la IP pot canviar a cada desplegament i caldria consultar-la cada cop amb `docker inspect`. Només es va fer servir un cop, abans que la VM tingués el compose nou.

## US de Taiga relacionades

- TG-89 (nginx-proxy-manager com a punt d'entrada HTTPS)
- TG-38 (desplegament a Virtech; on es van detectar els ports NAT)

## Enllaços

- [[nginx-proxy-manager]]
- [[arquitectura-fisica]]
- [[visio-general]]
- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]
