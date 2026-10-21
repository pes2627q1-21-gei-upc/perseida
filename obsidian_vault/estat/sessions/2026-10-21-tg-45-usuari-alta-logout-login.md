---
titol: "TG-45: alta automàtica, logout i pantalla de login"
tipus: sessio
estat: vigent
data: "2026-10-21"
us: ["TG-45", "TG-136", "TG-137", "TG-138", "TG-139", "TG-140", "TG-141", "TG-142"]
font: "backend/app, backend/tests, frontend/src, frontend/openapi; Taiga: US TG-45 i TG-43"
etiquetes: [sessio, backend, frontend, auth, usuaris, logout]
---

# Sessió 2026-10-21 · Alta automàtica, logout i pantalla de login

## Objectiu
US TG-45: que el compte es creï sol al primer accés amb Google, poder tancar la sessió (servidor i app) i, a petició de la persona, tenir la pantalla d'inici de sessió amb l'estètica Frutiger Cosmo (només la UI; el flux OAuth és de TG-43).

## Què s'ha fet
- **TG-136:** `User.record_login` i `User.account_status` (l'esborrat preval sobre qualsevol altre estat) amb tests de domini.
- **TG-137:** port `UserRepository`, `UserService.sign_in`, `SqlUserRepository` (alta amb `INSERT … ON CONFLICT DO NOTHING`, segura davant concurrència) i `UserAccountGateway`, que substitueix el gateway provisional de TG-44. Camp opcional `language` a `POST /api/auth/google`. Error nou `EMAIL_ALREADY_REGISTERED` (409) al catàleg d'errors.
- **TG-138:** `AuthService.logout(token)`: revoca la sessió sencera pel `sid`; idempotent.
- **TG-139:** `POST /api/auth/logout` (204) i `GET /api/users/me`; seccions als tres README del backend.
- **TG-140:** tests d'integració contra PostgreSQL i Redis reals (alta, accés recurrent, concurrència, 409, esborrat, suspès, `/users/me`, logout).
- **TG-141:** `features/auth` (`tokenStorage` amb `expo-secure-store`, `useLogout`, `LogoutButton`), pantalla `/login` amb la pluja de Perseides (`PerseidShower`) i botó «Continua amb Google» amb la G de Google; els tipus de l'API es generen ara de l'OpenAPI real del backend.
- **TG-142:** tests de `tokenStorage`, `logout`, `useLogout`, `LogoutButton` i de la pantalla de login.
- **Revisió d'arquitectura** (subagent `reviewer-arquitectura`): 0 crítiques i 1 alta, ja corregida. El logout no tancava la sessió amb un access token caducat (`exp`); ara `TokenCodec.decode(token, verify_expiry=False)` només s'usa per identificar la sessió, amb tests amb JWT real caducat. També: `language` amb `max_length`, `save_last_login` amb un sol `UPDATE`, el logout neteja els tokens encara que no es puguin llegir i no hi ha doble anunci a Android.
- **Cinc punts de la revisió, resolts a petició de la persona:**
  1. **Web:** `tokenStorage.web.ts` perquè `expo-secure-store` no existeix a web. Primer només en memòria i, a petició de la persona, ara a `sessionStorage` perquè sobrevisqui a la recàrrega (mor en tancar la pestanya; memòria com a reserva); vegeu [[0008-google-oauth2-pkce-jwks-i-sessio-propia]].
  2. **Colors fixos:** la traça de `PerseidShower` pren els tokens nous `meteors` (variants cap/cua) dels quatre temes (contrastos mesurats i comprovats per un test; al tema `dia` són colors foscos, perquè el blanc no es veu sobre el cel clar), documentats a `tokens.md` de la skill `estetica-frutiger-cosmo`.
  3. **Acció amb vidre:** nou `QuietButton` per a accions secundàries (ni gel ni vidre); `LogoutButton` el fa servir.
  4. **Acoblament `users` ↔ `auth`:** `AccountStatus` a `domain/shared`, codis comuns a `application/shared/error_codes.py`, `UserService.sign_in` sense `GoogleIdentity` i composició a `main.py`; tests d'arquitectura que ho vigilen ([[backend-hexagonal]]).
  5. **Logout silenciós:** si el servidor no ho confirma, `/login` ho explica (un 401 no avisa).
- **Pluja de Perseides, dues passades de la persona després de veure-la al mòbil:** (1) els estels queien cap al costat equivocat i la transició era bruta: ara el cap va al davant, la cua enrere, amb frenada suau, cua que s'allarga i s'encongeix i opacitat gradual; (2) més estels, de diferents colors, mides i posicions, sempre per darrere dels textos i dels botons, i amb un ritme aleatori dins de límits raonables (vegeu `receptes.md` de la skill). 6 tests de geometria, tests estadístics de l'aleatorietat amb llavor fixa i un test que comprova que el *shower* es pinta abans del contingut.
- **El llac, redissenyat a petició de la persona** («terrible, ni sabries que és un llac»): ara `SkyBackground` pinta el sol o la lluna darrere dels turons, un llac ovalat amb els turons reflectits, columna de llum que centelleja, ones, nenúfars amb flor, bombolles i lluentor, i **el prat al voltant** (el llac retallat de la caixa de gespa, línia de costa amb llum, herba, flors, joncs i herba alta que es mou). Tokens `lake` nous als quatre temes. S'ha verificat visualment amb una maqueta estàtica generada amb la mateixa geometria i els mateixos colors i oberta a Chrome (a mòbil no s'ha vist encara). A la pluja de Perseides: fins a 7 estels alhora (abans 5) i passen per darrere dels turons.
- **Reflexos de les Perseides, dues passades a petició de la persona** (la segona després de veure'ls encara «a l'aire»): primer, una capa retallada a l'aigua i profunditat mai negativa; després, el reflex és la imatge mirall exacta de l'estel (mateixa x, a tanta profunditat sota la línia de flotació com l'estel és a sobre, inclinat al revés, més feble com més avall), en una capa que comença sota els turons reflectits (l'aigua hi mostra els turons, no el cel). Només es reflecteixen els estels baixos, prop dels turons (45 % dels sorteigs), perquè la imatge d'un alt cauria sota la pantalla. A més, la capa es mesura amb `onLayout` i ja no amb la finestra: en telèfons on l'arrel és més curta que la finestra (barra d'estat o de navegació) la línia de flotació del *shower* es desplaçava respecte de l'aigua, que està ancorada a baix. Tests de la geometria del mirall i del desplaçament de capa.
- **La «G» de Google** (a petició de la persona): la «G» dibuixada a mà era la antiga i no coincidia amb l'oficial. Ara s'usa el botó d'icona oficial del paquet `signin-assets.zip` de les directrius de marca, copiat byte per byte a `frontend/assets/google/` (SHA-256 verificat contra el paquet i protegit amb un test). Origen i regles a `assets/google/README.md`.
- **Seguretat contra injecció SQL i XSS** (a petició de la persona), amb auditoria prèvia: l'accés a dades ja usava només paràmetres lligats i l'API només JSON, però faltaven capçaleres, validació d'URL i regles que ho mantinguessin. S'hi han afegit: `SecurityHeadersMiddleware`, `app/domain/shared/text.py` (neteja de text i URL `https`), validació del correu, l'avatar i l'URL de l'APOD, límits als tokens, un test d'arquitectura contra SQL fet amb cadenes, `safeHttpsUrl` i un `WebView` restrictiu al frontend, regles d'ESLint, la configuració de capçaleres del proxy i 106 tests nous (càrregues d'injecció SQL contra PostgreSQL real, marcatge hostil, `javascript:`, NUL). Decisió a [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]]; regles i estat de les dependències a [[seguretat]]. `certifi` actualitzat a 2026.10.19 (`pip-audit` net).
- A Taiga, la descripció de la US TG-43 explica què existeix i què li falta (flux PKCE, credencials, toasts, guard de ruta).

## Decisions preses
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] (secció «Concreció (TG-45)»): 409 per correu d'un altre compte sense vincular identitats, logout idempotent pel `sid`, `language` opcional, `/users/me` comprova l'estat a la base de dades.
- Dependències noves al frontend, fixades a les versions compatibles amb Expo SDK 57 i aprovades per la persona: `react-native-svg` 15.15.4, `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, `expo-secure-store` 57.0.4 i `phosphor-react-native` 3.0.6.
- Textos de la pantalla només en català (`strings.ts`), com l'APOD, fins que arribi i18next (TG-91).

## Canvis al vault
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]], [[api]], [[frontend]] i [[backend-hexagonal]] (regla de mòduls independents).
- [[seguretat]] i [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]] nous; [[api]] i [[frontend]] amb la secció de seguretat.
- Skill `estetica-frutiger-cosmo`: tokens `meteor.*`, recepta `QuietButton` i regla de la «G» oficial de Google.

## Pendent / següents passos
- [ ] TG-43: flux PKCE, credencials de Google, guard de ruta, toasts i claus i18n dels codis (incloent `EMAIL_ALREADY_REGISTERED`); eliminar el missatge temporal de `login.tsx`.
- [ ] Veure la pantalla de login en un dispositiu (incloent el llac nou, el logotip oficial de Google i la pluja de Perseides als quatre temes) (no s'ha pogut provar visualment: no hi ha `react-native-web`).
- [ ] El títol de `/login` i el de la home no compleixen el contrast sobre l'horitzó del tema `posta` (2,33:1); revisar quan `posta` sigui seleccionable.
- [ ] Aplicar `infra/nginx-proxy-manager/security-headers.conf` al proxy real (substituint `<API_ORIGIN>`) i comprovar-ho amb `curl -sI` i la consola del navegador.
- [ ] Passar `pip-audit` i `pnpm audit` a cada canvi de dependències (vegeu [[seguretat]]); valorar afegir-ho a la CI.
- [ ] Acceptar l'ADR-0024 a la PR (és `proposada`).
- [ ] Quan s'implementi el panell d'admin, valorar la galeta `httpOnly` en lloc de `sessionStorage` (un XSS podria llegir els tokens) i no carregar-hi scripts de tercers.
- [ ] Decidir si la sessió ha d'usar `users.id` en lloc de `google_sub` (heretat de TG-135).
- [ ] Tancar a Taiga les subtasques i, després de la PR aprovada, moure la US a `Done` (només la persona).

## US de Taiga
- TG-45, tasques TG-136 a TG-142; TG-43 (coordinació)
