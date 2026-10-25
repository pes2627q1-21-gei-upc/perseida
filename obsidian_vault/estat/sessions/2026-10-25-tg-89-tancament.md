---
titol: "Sessió 2026-10-25: tancament de nginx-proxy-manager (TG-89)"
tipus: sessio
estat: vigent
data: "2026-10-25"
us: ["TG-89", "TG-43", "TG-77"]
font: "PR #48 (aprovada i fusionada a develop el 2026-10-24); prova en un nginx temporal amb infra/nginx-proxy-manager/static.conf; Public Suffix List"
etiquetes: [sessio, devops, nginx-proxy-manager, google-oauth, tg-89]
---

# Sessió 2026-10-25 · Tancament de nginx-proxy-manager (TG-89)

## Objectiu

Acabar el que quedava de la TG-89 després de fusionar la PR #48 ([[2026-10-24-tg-89-nginx-proxy-manager]]).

## Què s'ha fet

1. **[[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] passa a `acceptada`:** l'equip la va aprovar a la PR #48.
2. **Nota de la revisió sobre `alias` + `try_files` a `/admin/`:** provada en un nginx temporal amb els `.conf` del repo, la `root` global d'NPM i una regex com la de *Cache Assets*. Un `.js`, un `.css` i un `.png` reals sota `/admin/` es serveixen des del volum amb el tipus correcte. Les rutes de la SPA tornen `index.html`. No cal cap *named location*.
3. **Pas 8 de la #326 (Google OAuth):**
   - `duckdns.org` és a la Public Suffix List, de manera que `perseida.duckdns.org` es pot afegir com a domini autoritzat.
   - L'app Android no el necessita, perquè torna per `perseida://`.
   - El client web del panell sí que el necessita: cal registrar l'origen `https://perseida.duckdns.org:40431`.

## Decisions preses

- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] acceptada.

## Canvis al vault

- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]: estat i conseqüència de Google OAuth.

## Pendent / següents passos

- [ ] Registrar `perseida.duckdns.org` (domini autoritzat) i l'origen `https://perseida.duckdns.org:40431` al client OAuth web de Google Cloud (qui gestiona la TG-43).
- [ ] Després de la *release* a `main`: comprovar `127.0.0.1:81->81` a la VM, el túnel i el volum `admin_dist`.
- [ ] `/admin/` a producció quan la TG-77 hi posi el paquet (amb `experiments.baseUrl: "/admin"`).
- [ ] TG-89 a `Done` quan es tanquin la #193 i la #326.

## US de Taiga

- TG-89 (tasques #193 i #326)
- TG-43 (client OAuth)
- TG-77 (panell a `/admin/`)
