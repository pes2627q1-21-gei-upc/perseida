---
titol: "Seguretat: injecció SQL, XSS i dependències"
tipus: convencio
estat: vigent
data: "2026-11-21"
us: ["TG-45", "TG-89", "TG-338", "TG-383", "TG-384"]
font: "auditoria de TG-45 (2026-10-21); backend/tests/architecture/test_sql_safety.py; backend/app/infrastructure/api/security_headers.py; frontend/.eslintrc.js; infra/nginx-proxy-manager/security-headers.conf; infra/nginx-proxy-manager/static.conf (TG-89); revisió de TG-628 (17/11/2026); auditoria de les dependències del frontend amb `pnpm audit` sobre el lockfile de develop (TG-338, 21/11/2026); .github/workflows/ci.yml i backend/app/infrastructure/apod/nasa_feed_client.py (TG-383, 21/11/2026); job `frontend` de .github/workflows/ci.yml i `pnpm audit --prod --audit-level=high` en local (TG-384, 21/11/2026)"
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

XML extern (feed de la NASA): es parseja amb `defusedxml` (`fromstring(..., forbid_dtd=True)`), que rebutja qualsevol DTD i, amb ella, l'expansió d'entitats i les entitats externes; el feed es dona per invàlid (`NasaApodError`). Ho prova `test_tg383_entities_of_a_dtd_are_never_expanded` (TG-383).

## XSS

| Capa | Regla | On |
|---|---|---|
| API | Només JSON, mai HTML; cap resposta construïda amb text d'usuari sense escapar | `app/infrastructure/api/` |
| API | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP `default-src 'none'`, `no-store` a `/api/auth` i `/api/users`, HSTS darrere HTTPS | `security_headers.py` |
| Domini | Caràcters de control fora, longituds acotades, enllaços només `https` sense credencials; el marcatge es desa tal qual i l'escapa la sortida. El text que escriuen les usuàries (xat, publicacions) passa per `clean_user_text`, que també treu els invisibles perillosos | `app/domain/shared/text.py` |
| App | Tot enllaç que vingui de l'API o d'un tercer passa per `safeHttpsUrl` abans d'`<Image>`, `WebView` o `Linking.openURL` | `frontend/src/shared/security/safeUrl.ts` |
| App | `WebView` amb `originWhitelist` a `https`, `mixedContentMode="never"`, sense accés a fitxers ni galetes de tercers | `ApodMedia.tsx` |
| App | Prohibits `eval`, `new Function`, `javascript:`, `dangerouslySetInnerHTML`, `innerHTML`, `document.write` | `frontend/.eslintrc.js` (la CI executa `pnpm lint`) |
| Proxy | CSP estricta al panell d'administració; `sandbox` i `nosniff` als fitxers dels usuaris | `infra/nginx-proxy-manager/static.conf` (HSTS de l'API a `security-headers.conf`) |

> [!warning] Fitxers pujats pels usuaris
> Quan s'implementin els mitjans dels usuaris: validar el tipus pel contingut (no per l'extensió ni per l'encapçalament), no servir mai SVG ni HTML com a imatge, generar el nom del fitxer al servidor i servir-los des de la ubicació `/media/` amb la política de `sandbox` de `static.conf`.

## Dependències

- Al backend, la CI ja passa `uv run pip-audit` (OSV, sobre `uv export`) i `bandit` a cada PR. Al frontend, des de TG-384 el job `frontend` passa `pnpm audit --prod --audit-level=high` a cada PR, però **com a avís** (`continue-on-error: true`): no bloqueja la PR. TG-338 l'ha de fer bloquejant.
- Des de TG-383, el job `backend` de la CI audita les dependències de producció del backend (pip-audit contra OSV) i analitza el codi amb bandit; tots dos passos bloquegen la PR. Ordres i detall a [[testing#Seguretat estàtica i dependències (TG-362)]].
- Si cal acceptar un risc: a bandit, la regla a `skips` de `[tool.bandit]` (`backend/pyproject.toml`) amb un comentari del motiu, mai `# nosec` en línia (criteri 4 de TG-362; `skips` desactiva la regla a tot `app/`, de manera que primer s'intenta corregir el codi), o `--ignore-vuln <ID>` al pas de la CI (pip-audit), i en tots dos casos una fila a la taula d'estat de sota amb el motiu, qui l'accepta i la data de revisió.
- **Pendent de TG-338 (no acceptat):** `pnpm audit --prod --audit-level=high` informa de GHSA-mrhx-c7xc-m3w5 (`zod` < 4.6.6, gravetat alta, esgotament de memòria en validar col·leccions grans), que arriba via `expo` → `@expo/cli` i no té correcció dins la 3.x. No és a la taula de riscos acceptats perquè ningú no l'ha acceptat: TG-338 ha de decidir què se'n fa (corregir-lo, acceptar-lo amb motiu, responsable i data de revisió, o una altra opció) i fer el pas bloquejant. Detall a [[testing#Seguretat estàtica i dependències (TG-362)]].
- Es corregeix tot el que té versió arreglada i compatible, fixant-la amb `uv`/`pnpm`.
- El que no té arreglament es **tria**: si és de producció (arriba al paquet de l'app o al servidor) o només d'eines de compilació, i si és explotable amb les nostres entrades.

### Estat a 2026-11-21

Auditoria de TG-338 del 21/11/2026 sobre el lockfile de `develop`.

| Dependència | Gravetat | On arriba | Decisió |
|---|---|---|---|
| `certifi` 2026.7.22 (backend) | Coneguda | Producció (HTTPS de `httpx`) | **Corregida**: 2026.10.19 |
| `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5) | Alta | Via `@expo/cli` 58.1.15 | **Corregida**: `expo` 58.0.26 (`@expo/cli` 58.1.21 ja no en depèn) |
| `postcss-selector-parser` 6.1.4 (GHSA-rj75-hqrm-r3gf) | Moderada | Via `tailwindcss`/`nativewind` | **Corregida**: 6.1.6 al lockfile, dins del rang |
| `qs` 6.15.1 (4 advisories) | Moderada | Via Stryker → `typed-rest-client` 2.3.1; només dev | **Corregida**: override `typed-rest-client>qs: 6.17.1` a `frontend/pnpm-workspace.yaml` (mateixa versió major) |
| `uuid` 3.4.0 (GHSA-w5hq-g745-h8pq) | Moderada | Via `@expo/ngrok`; només dev | **Eliminada**: fora `@expo/ngrok` (només servia per a `expo start --tunnel`; `npx expo start --tunnel` l'instal·la sota demanda) |
| `node-forge`, `braces`, `sprintf-js` | — | — | Ja corregits abans de TG-338 (`node-forge` 1.4.3); no surten a l'audit |
| `minimatch` 10.2.6 (GHSA-g3hv-75wg-m249) | Moderada | Via `expo` → `@expo/fingerprint` 0.21.10; surt a `--prod`, però és una eina de build i no va al paquet de l'app | **Acceptada**: la correcció (≥ 11.0.1) és un salt de versió major dins d'Expo. Accepta: la persona responsable de TG-338, 21/11/2026. Es revisa en actualitzar Expo, i com a molt tard el 2026-12-21 |
| `glob` 10.5.0 / 13.0.6 i `minimatch` 9.0.9 (GHSA-3g3m-2fjr-6pw4 i GHSA-g3hv-75wg-m249) | Moderada | Via Jest, `test-exclude`, Stryker i typescript-eslint; només dev | **Acceptada**: només eines de proves; correcció amb salt de versió major. Accepta: la persona responsable de TG-338, 21/11/2026. Es revisa en actualitzar Expo, i com a molt tard el 2026-12-21 |
| `decode-uri-component` | — | — | Ja no hi és: no surt al lockfile ni a l'audit (21/11/2026) |

Estat després de TG-338: `pnpm audit`, 2 moderades; `pnpm audit --prod`, 1 moderada; `pnpm audit --prod --audit-level=high`, sense troballes (exit 0).

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
