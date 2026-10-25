---
titol: "Sessió 2026-10-25: tancament de nginx-proxy-manager (TG-89)"
tipus: sessio
estat: vigent
data: "2026-10-25"
us: ["TG-89", "TG-43", "TG-77"]
font: "PR #48 (aprovada i fusionada a develop el 2026-10-24); prova en un nginx temporal amb infra/nginx-proxy-manager/static.conf; comprovació de producció del 2026-10-25 (/admin/ donava 500); Public Suffix List"
etiquetes: [sessio, devops, nginx-proxy-manager, google-oauth, tg-89]
---

# Sessió 2026-10-25 · Tancament de nginx-proxy-manager (TG-89)

## Objectiu

Acabar el que quedava de la TG-89 després de fusionar la PR #48 ([[2026-10-24-tg-89-nginx-proxy-manager]]).

## Què s'ha fet

1. **[[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] passa a `acceptada`:** l'equip la va aprovar a la PR #48.
2. **Nota de la revisió sobre `alias` + `try_files` a `/admin/`:** provada en un nginx temporal amb els `.conf` del repo, la `root` global d'NPM i una regex com la de *Cache Assets*. Amb el paquet, un `.js`, un `.css` i un `.png` reals es serveixen bé. Però **sense el paquet**, que és el cas de producció fins a la TG-77, `/admin/...` donava **500** per un bucle de redireccions internes (`rewrite or internal redirection cycle`).
   - Arreglat a `static.conf`: `root /` en lloc d'`alias` i `try_files $uri /admin/index.html =404`.
   - Amb el paquet: tot 200, també el *fallback* de la SPA.
   - Sense el paquet: 404 net.
   - `/admin/../` no surt del volum.
3. **Pas 8 de la #326 (Google OAuth):**
   - `duckdns.org` és a la Public Suffix List, de manera que `perseida.duckdns.org` es pot afegir com a domini autoritzat.
   - L'app Android no el necessita, perquè torna per `perseida://`.
   - El client web del panell sí que el necessita: cal registrar l'origen `https://perseida.duckdns.org:40431`.

## Decisions preses

- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]] acceptada.

## Canvis al vault

- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]: estat i conseqüència de Google OAuth.

## Pendent / següents passos

- [x] Registrat a Google Cloud: `perseida.duckdns.org` com a domini autoritzat i l'origen `https://perseida.duckdns.org:40431` al client `perseida-web`. La #326 està tancada.
- [ ] Tornar a enganxar `static.conf` a la configuració avançada del proxy host local i del de producció.
- [ ] Després de la *release* a `main`: comprovar `127.0.0.1:81->81` a la VM, el túnel i el volum `admin_dist`.
- [ ] `/admin/` a producció quan la TG-77 hi posi el paquet (amb `experiments.baseUrl: "/admin"`).
- [ ] TG-89 a `Done` quan es tanquin la #193 i la #326.

## US de Taiga

- TG-89 (tasques #193 i #326)
- TG-43 (client OAuth)
- TG-77 (panell a `/admin/`)
