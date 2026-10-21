---
titol: "Sessió 2026-10-21 · Multimèdia i estats de la pantalla de l'APOD (TG-119, TG-120)"
tipus: sessio
estat: vigent
data: "2026-10-21"
us: ["TG-48"]
font: "treball de les tasques TG-119 i TG-120 de la US TG-48 (branca feature/TG-48-multimedia-i-estats)"
etiquetes: [sessio, frontend, tg-48, apod]
---

# Sessió 2026-10-21 · Multimèdia i estats de la pantalla de l'APOD (TG-119, TG-120)

## Objectiu

Omplir l'espai multimèdia de la pantalla `/apod` (TG-119, criteris 2 i 3 de TG-48) i afegir-hi els estats de càrrega i d'error amb reintent (TG-120, criteris 4 i 5), sobre la maquetació de [[2026-10-18-tg-118-maquetacio-pantalla-apod]].

## Què s'ha fet

- **`ApodMedia`** (`features/apod/components/ApodMedia.tsx`):
  - Imatge amb `resizeMode="contain"`. El marc pren la proporció real de la imatge en carregar (`onLoad`); fins llavors és 4:3. No es deforma ni es retalla.
  - Vídeo en un reproductor incrustat (`react-native-webview`, marc 16:9) amb la `url` de l'API.
- **`ApodStatus`** (`features/apod/components/ApodStatus.tsx`):
  - Càrrega: `ActivityIndicator` amb etiqueta accessible.
  - Error: missatge segons el `code` de l'`AppError` dins de `GlassPanel`, més un `GelButton` «Torna-ho a provar» que crida `refetch()`.
- **Pantalla** (`src/app/(app)/apod.tsx`):
  - Mostra el contingut si hi ha dades.
  - Si no n'hi ha i hi ha error sense petició en curs, mostra l'error.
  - En qualsevol altre cas, mostra la càrrega. Així, en reintentar es passa d'error a càrrega i després a contingut.
- **Textos** a `features/apod/strings.ts`, amb `apodErrorMessage(code)`:
  - `APOD_UNAVAILABLE`: text del catàleg.
  - `NETWORK_ERROR`: text nou.
  - Qualsevol altre codi: el text d'`INTERNAL_ERROR`.
  - El `detail` del servidor no es mostra mai ([[0018-errors-rfc-9457-amb-codis-estables]]).
- **Tests** (`ApodScreen.test.tsx`): càrrega, imatge i proporció, vídeo, error del backend, error de xarxa, reintent i codi desconegut. `react-native-webview` es simula a Jest.
- **Dependència**: `react-native-webview` 13.16.1, la que fixa Expo SDK 57 (`bundledNativeModules.json`).

## Decisions preses

La persona responsable ha aprovat les decisions següents:

- Vídeo amb **reproductor incrustat** (no accés directe extern).
- Imatge amb la **proporció real**.
- **Spinner** com a estat de càrrega, no skeleton.
- Textos en català. `NETWORK_ERROR` s'afegeix al catàleg de `gestio-errors` com a codi del client.
- Sense variant web del reproductor: `react-native-webview` no funciona a la web i la pantalla és del grup mòbil `(app)`.

Després de la revisió de `reviewer-arquitectura`:

- **Accessibilitat del vídeo.** L'etiqueta va al `WebView`, no a un embolcall `accessible`, que amagaria els controls del reproductor al lector de pantalla.
- **Navegació del reproductor.** El reproductor només navega dins del host del vídeo. Fa servir `keepInPlayer`, `originWhitelist` https i `setSupportMultipleWindows={false}`. Els enllaços a altres hosts s'obren al navegador del sistema.
- **Reintent.** El botó «Torna-ho a provar» només surt si l'error és `retryable`, com diu la skill `gestio-errors`. Un 404 només mostra el missatge.
- **Anunci de l'error.** `polite`: `accessibilityLiveRegion` a Android i `announceForAccessibility` a iOS.
- **Mapa `code` → text.** Es queda a `features/apod/strings.ts` fins a TG-91.
- **Fallada del multimèdia.** Si la imatge o el vídeo no carreguen, al marc surt «No s'ha pogut carregar la imatge o el vídeo.». El títol i el text continuen visibles.

## Validació dels criteris de TG-48 (TG-121)

Tests de `frontend/src/features/apod/components/ApodScreen.test.tsx` (pantalla amb `fetch` simulat), més la comprovació manual a Expo Go descrita a «Pendent».

| # | Criteri | Test automàtic | Comprovació manual |
|---|---|---|---|
| 1 | Títol, data, explicació i `copyright` (si n'hi ha) | `shows the title, date, explanation and copyright…`, `hides the copyright line…` | Fet: imatge amb © i vídeo sense © |
| 2 | Imatge adaptada a la pantalla | `renders an image APOD as an image without cropping`, `adapts the image frame to the real proportions…` | Fet: apaïsada, vertical i panoràmica, en dues mides (normal i amb zoom de pantalla) |
| 3 | Vídeo amb reproductor incrustat | `renders a video APOD in an embedded player`, `keepInPlayer` | Fet: YouTube incrustat amb `Referer` |
| 4 | Estat de càrrega | `shows the loading state until the data arrives` | Fet: spinner |
| 5 | Error entenedor i reintent | `shows the catalogue message…`, `shows the network message…`, `retries from the error state…`, `does not offer a retry…` | Fet: 503 amb reintent i sense xarxa amb recuperació |

El servei i el hook ja tenien tests propis des de TG-117 (`getApodToday.test.ts`, `useApodToday.test.tsx`).

**Incidències trobades i com s'han tractat:**
- Error 153 de YouTube: corregit a TG-119 (`Referer`).
- Error de NativeWind a la web: derivat al panell d'admin; no és d'aquesta US.
- Segona mida de pantalla: comprovada amb el zoom de pantalla del sistema.

## Canvis al vault

- [[frontend]]: avís d'estat i fila «Vídeo incrustat» a l'stack.
- Catàleg de codis de `gestio-errors` (`.agents/skills/gestio-errors/references/cataleg-codis.md`), sincronitzat a `.claude/skills/`.

## Pendent / següents passos

- [x] Comprovació a Expo Go (mòbil físic) amb un mock local de `/api/apod`, fora del repo:
  - imatge apaïsada, vertical (600×1400) i panoràmica (1800×500), sense deformar-se ni retallar-se;
  - vídeo de YouTube incrustat, que ja no dona el 153 un cop afegit el `Referer`;
  - spinner, error `APOD_UNAVAILABLE` amb reintent cap a càrrega i contingut, i error de xarxa amb recuperació.
- [x] Segona mida de pantalla per a TG-119: s'ha provat amb el zoom de pantalla del sistema (amplada lògica menor).
- [ ] YouTube rebutjava l'embed sense `Referer` (error 153 a Expo Go). Ara el WebView envia `Referer: https://edu.upc.perseida` (`PLAYER_REFERER` a `ApodMedia.tsx`), proposat per l'agent i acceptat per la persona responsable. Quan l'equip fixi l'`android.package` a `app.json`, cal que coincideixin.
- [ ] Validar al backend que la `url` de l'APOD és `https` (`HttpUrl`): US a part, no feta aquí.
- [ ] `INVALID_RESPONSE` (codi del client) encara no té fila al catàleg.
- [ ] TG-91: textos es/en d'`apodStrings` i de `NETWORK_ERROR`.
- [ ] TG-121: proves de components i validació d'usabilitat.
- [ ] A la web (`pnpm expo start` → `w`), NativeWind (`react-native-css-interop`) llança «Cannot manually set color scheme, as dark mode is type 'media'». No ve d'aquesta US; caldrà resoldre-ho quan es faci el panell d'admin.
- [ ] El checkout a Windows amb CRLF continua fent fallar Prettier als fitxers no tocats (`.gitattributes`, vegeu la sessió de TG-118).

## US de Taiga

- TG-48
