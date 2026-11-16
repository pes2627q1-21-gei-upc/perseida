---
titol: "Seguretat: injecció SQL, XSS i dependències"
tipus: convencio
estat: vigent
data: "2026-10-24"
us: ["TG-45", "TG-89"]
font: "auditoria de TG-45 (2026-10-21); backend/tests/architecture/test_sql_safety.py; backend/app/infrastructure/api/security_headers.py; frontend/.eslintrc.js; infra/nginx-proxy-manager/security-headers.conf; infra/nginx-proxy-manager/static.conf (TG-89)"
etiquetes: [convencio, seguretat, sql-injection, xss, csp, dependencies]
---

# Seguretat: injecció SQL, XSS i dependències

## Regla

Cap valor que vingui de fora (usuari, Google, NASA, un fitxer pujat) arriba a la base de dades dins d'una cadena SQL ni al navegador o al `WebView` com a codi o com a enllaç no verificat. Les raons i les alternatives són a [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]].

## Injecció SQL

| Regla | Com es fa complir |
|---|---|
| Només paràmetres lligats: `select`, `insert`, `update` de SQLAlchemy/SQLModel | Revisió de PR |
| `text()`, `execute()` i `exec_driver_sql()` només amb cadenes literals, mai f-string, `+`, `%` ni `.format()` | `backend/tests/architecture/test_sql_safety.py` (aplicació i migracions) |
| Cap valor extern es posa mai en un nom de taula, de columna o d'ordre | Revisió de PR |
| Entrades acotades: longituds de columna al domini, `max_length` als cossos | `app/domain/shared/text.py`, `app/domain/users/models.py`, `app/infrastructure/auth/router.py` |
| Prova amb càrregues d'atac contra PostgreSQL real | `backend/tests/integration/test_users_api.py` (`test_sql_injection_payloads…`) |

## XSS

| Capa | Regla | On |
|---|---|---|
| API | Només JSON, mai HTML; cap resposta construïda amb text d'usuari sense escapar | `app/infrastructure/api/` |
| API | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP `default-src 'none'`, `no-store` a `/api/auth` i `/api/users`, HSTS darrere HTTPS | `security_headers.py` |
| Domini | Caràcters de control fora, longituds acotades, enllaços només `https` sense credencials; el marcatge es desa tal qual i l'escapa la sortida | `app/domain/shared/text.py` |
| App | Tot enllaç que vingui de l'API o d'un tercer passa per `safeHttpsUrl` abans d'`<Image>`, `WebView` o `Linking.openURL` | `frontend/src/shared/security/safeUrl.ts` |
| App | `WebView` amb `originWhitelist` a `https`, `mixedContentMode="never"`, sense accés a fitxers ni galetes de tercers | `ApodMedia.tsx` |
| App | Prohibits `eval`, `new Function`, `javascript:`, `dangerouslySetInnerHTML`, `innerHTML`, `document.write` | `frontend/.eslintrc.js` (la CI executa `pnpm lint`) |
| Proxy | CSP estricta al panell d'administració; `sandbox` i `nosniff` als fitxers dels usuaris | `infra/nginx-proxy-manager/static.conf` (HSTS de l'API a `security-headers.conf`) |

> [!warning] Fitxers pujats pels usuaris
> Quan s'implementin els mitjans dels usuaris: validar el tipus pel contingut (no per l'extensió ni per l'encapçalament), no servir mai SVG ni HTML com a imatge, generar el nom del fitxer al servidor i servir-los des de la ubicació `/media/` amb la política de `sandbox` de `static.conf`.

## Dependències

- Passar `uvx pip-audit` (backend, sobre `uv export`) i `pnpm audit` (frontend) a cada canvi de dependències.
- Es corregeix tot el que té versió arreglada i compatible, fixant-la amb `uv`/`pnpm`.
- El que no té arreglament es **tria**: si és de producció (arriba al paquet de l'app o al servidor) o només d'eines de compilació, i si és explotable amb les nostres entrades.

### Estat a 2026-10-21

| Dependència | Gravetat | On arriba | Decisió |
|---|---|---|---|
| `certifi` 2026.7.22 (backend) | Coneguda | Producció (HTTPS de `httpx`) | **Corregida**: 2026.10.19 |
| `node-forge`, `braces`, `uuid`, `sprintf-js`, `postcss-selector-parser` | Alta i moderada | Només eines de compilació i proves (`@expo/cli`, Metro, Jest, Tailwind, ngrok); no van al paquet de l'app | Acceptada; sense versió arreglada o amb un salt de versió major. Es revisa en actualitzar Expo |
| `decode-uri-component` 0.2.2 (via `expo-router`) | Moderada (DoS) | L'app, en llegir un enllaç profund | Acceptada: l'arreglat (0.5) és només ESM i trencaria `query-string` 7. Es revisa en actualitzar Expo Router |

## Què cal fer en una funcionalitat nova

- [ ] Cap SQL fet amb cadenes; el test d'arquitectura passa.
- [ ] Cada camp de text nou té longitud màxima al domini i a l'esquema de la petició.
- [ ] Tot enllaç extern es mostra o s'obre només després de `safeHttpsUrl` (o `safe_https_url` al backend).
- [ ] Cap `innerHTML`, `eval` ni `dangerouslySetInnerHTML`; `pnpm lint` passa.
- [ ] Un test amb una càrrega hostil (`'; DROP TABLE …`, `<script>…`, `javascript:…`) que demostri que es desa o es mostra com a text inert.

## Enllaços

- [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
- [[qualitat]]
- [[testing]]
- [[api]]
- [[frontend]]
