---
titol: "Defensa en profunditat contra injecció SQL i XSS"
tipus: adr
estat: proposada
data: "2026-10-21"
us: ["TG-45"]
font: "petició de la persona responsable (2026-10-21): el sistema ha de ser segur contra injecció SQL i XSS; auditoria del codi de TG-45 i dels directoris backend/ i frontend/"
etiquetes: [adr, seguretat, sql-injection, xss, csp, backend, frontend, infra]
---

# ADR-0024 · Defensa en profunditat contra injecció SQL i XSS

## Context

La persona responsable demana que tot el sistema sigui segur davant d'injecció SQL i XSS. Cap controlador no pot garantir «completament segur» (no existeix); el que sí es pot fer és que cada atac necessiti **diverses** fallades alhora, i que les regles es comprovin amb tests i no només amb bona voluntat. L'auditoria del codi va donar:

- **SQL:** tot l'accés a dades passa per SQLAlchemy/SQLModel amb paràmetres lligats; l'únic `text()` que hi ha és de constants (valors per defecte de les columnes i una consulta fixa d'`alembic/env.py`). No hi havia cap regla que ho mantingués així.
- **XSS:** l'API respon només JSON (cap HTML) i React escapa tot el text; però l'API no enviava cap capçalera de seguretat, les dades de tercers (URL de l'APOD, avatar de Google) s'usaven sense validar-ne l'esquema (`javascript:`, `data:`) i el reproductor de vídeo era un `WebView` amb la configuració per defecte.
- **Dependències:** `pip-audit` i `pnpm audit` trobaven vulnerabilitats conegudes.

## Decisió

Es fixen quatre capes, per ordre de preferència.

1. **No es construeix mai SQL amb cadenes.** Els valors van sempre com a paràmetres lligats. Un test d'arquitectura (`tests/architecture/test_sql_safety.py`) falla si `text()`, `execute()` o `exec_driver_sql()` reben un f-string, una concatenació, `%` o `.format()`, a l'aplicació i a les migracions.
2. **Les entrades externes es validen al límit, al domini.** `app/domain/shared/text.py`: `clean_text` treu els caràcters de control (inclòs el NUL, que PostgreSQL rebutja) i talla a la longitud de la columna; `safe_https_url` només deixa passar enllaços `https` sense credencials. S'apliquen al nom i a l'avatar de l'usuari, al correu (longitud i caràcters) i a l'URL del mitjà de l'APOD. Els tokens de les peticions tenen `max_length`. El marcatge **no** s'elimina: escapar és feina de la sortida, i esborrar-lo corromp noms legítims.
3. **La sortida no es pot interpretar com a codi.**
   - **API:** `SecurityHeadersMiddleware` posa a totes les respostes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` i una `Content-Security-Policy` de `default-src 'none'` (només la documentació interactiva, `/api/docs` i `/api/redoc`, rep una política que li deixa carregar els seus recursos de jsDelivr); HSTS si la petició arriba per HTTPS; `Cache-Control: no-store` a `/api/auth` i `/api/users`.
   - **Frontend:** `safeHttpsUrl` filtra tot enllaç que ve de l'API o d'un tercer abans que arribi a un `<Image>`, a un `WebView` o a `Linking.openURL`; el reproductor de l'APOD té `mixedContentMode="never"`, sense accés a fitxers ni galetes de tercers. ESLint prohibeix `eval`, `new Function`, `javascript:`, `dangerouslySetInnerHTML`, `innerHTML` i `document.write`.
   - **Proxy:** `infra/nginx-proxy-manager/security-headers.conf` té la CSP estricta del panell d'administració (cap script en línia ni de tercers) i la de `sandbox` per als fitxers dels usuaris, que no han de poder executar-se mai com a pàgina.
4. **Dependències vigilades.** `pip-audit` (backend) i `pnpm audit` (frontend) es passen a cada canvi de dependències; es corregeix el que té versió arreglada i la resta es tria i es documenta a [[seguretat]].

## Conseqüències

### Positives

- Una injecció SQL necessitaria saltar-se SQLAlchemy **i** el test d'arquitectura; un XSS, saltar-se l'escapament de React, la validació d'URL, la CSP de l'API o la del proxy.
- Els atacs queden coberts per tests: càrregues d'injecció SQL contra PostgreSQL real, marcatge hostil al perfil, enllaços `javascript:` i `data:`, caràcters NUL.
- Cap dependència nova al projecte.

### Negatives (assumides)

- Els tokens del panell web viuen a `sessionStorage` ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]): un XSS que s'escapés de totes les capes els podria llegir. La CSP estricta del proxy és la mitigació; la galeta `httpOnly` seria més segura i queda per quan s'implementi el panell.
- La CSP de la documentació de l'API admet `unsafe-inline` perquè Swagger UI arrenca amb un script en línia; la documentació es podria desactivar en producció si es vol evitar-ho (avui no hi ha cap interruptor).
- Les respostes 500 d'una excepció no controlada no passen pel middleware (les genera `ServerErrorMiddleware`, per fora) i no porten les capçaleres; el cos és un JSON genèric.
- Vulnerabilitats de dependències sense versió arreglada (eines de compilació d'Expo, Jest) queden acceptades i documentades.
- El validador d'URL és deliberadament estricte: un avatar o un vídeo que no sigui `https` ja no es mostra.

## Alternatives descartades

- **Sanejar HTML al servidor (eliminar etiquetes dels noms):** corromp dades legítimes i dona una falsa sensació de seguretat; l'escapament pertany a la sortida.
- **Afegir una llibreria de sanejament o de seguretat per a ESLint:** una dependència nova per a regles que ja cobreix el nucli d'ESLint.
- **Forçar versions noves de dependències transitives amb `overrides`:** `decode-uri-component` 0.5 és només ESM i trencaria `query-string` 7 d'Expo Router; `postcss-selector-parser` 7 és un salt de versió major de les eines de Tailwind. Es documenta el risc en lloc d'arriscar un trencament.

## US de Taiga relacionades

- TG-45 (model d'usuari, alta automàtica i tancament de sessió)

## Enllaços

- [[seguretat]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]
- [[api]]
- [[frontend]]
- [[nginx-proxy-manager]]
