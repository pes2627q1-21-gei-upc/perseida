---
titol: "Sessió 2026-10-18 · Maquetació de la pantalla de l'APOD (TG-118)"
tipus: sessio
estat: vigent
data: "2026-10-18"
us: ["TG-48"]
font: "treball de la tasca TG-118 de la US TG-48 (branca feature/TG-118-maquetacio-pantalla-apod); mockup de Figma de la incepció"
etiquetes: [sessio, frontend, tg-48, apod, expo-router]
---

# Sessió 2026-10-18 · Maquetació de la pantalla de l'APOD (TG-118)

## Objectiu

Maquetar la pantalla de l'APOD del dia (TG-118, US TG-48): títol, data, explicació i autoria, amb l'espai per al multimèdia que omplirà TG-119. Com que encara no hi havia cap base de navegació ni de tema al frontend, també s'ha muntat la base mínima de l'[[0020-frontend-expo-router-i-estetica-frutiger-cosmo]].

## Què s'ha fet

- **Contracte provisional** (`frontend/openapi/apod.provisional.json`) alineat amb l'ACORD de TG-47: camps `date` i `url` (abans `apod_date` i `media_url`), paràmetre opcional `date` i resposta 422. Tipus regenerats i mocks actualitzats.
- **Base del frontend**: Expo Router a `src/app` amb el grup `(app)`, fonts M PLUS Rounded 1c i Open Sans, `QueryClient` de TanStack Query i tokens dels quatre temes (`dia`, `posta`, `nit`, `vermell`) a `src/shared/theme`, copiats de la skill `estetica-frutiger-cosmo` (`tokens.md`).
- **Components compartits** a `src/shared/ui`: `SkyBackground` (cel i llac estàtics), `GlassPanel` (vidre amb fallback opac si «Redueix la transparència») i `GelButton` (botó de gel senzill).
- **Pantalla `/apod`** (`src/app/(app)/apod.tsx` + `features/apod/components/ApodView.tsx`): espai del multimèdia, títol (capçalera accessible), data en l'idioma del dispositiu, explicació en vidre i `copyright` si n'hi ha.
- **Inici provisional** (`src/app/(app)/index.tsx`) amb un botó cap a `/apod`.
- `frontend/.env.example` amb `EXPO_PUBLIC_API_BASE_URL`, que no estava documentada.

## Decisions preses

- La pantalla de l'APOD viu a la ruta `/apod` i no a l'inici. El mockup de Figma no té pantalla pròpia de l'APOD: és un post del feed «Your Perseidas» amb «more». Quan es faci el feed, la targeta enllaçarà a `/apod`.
- L'inici actual és **temporal** i s'ha de substituir sencer quan es faci la US de la pantalla d'inici.
- De moment el tema segueix el sistema (clar → `dia`, fosc → `nit`). Els quatre modes d'ajustos i l'interruptor vermell queden per a una altra US.
- L'escena viva (Skia), les icones Phosphor, el so i les animacions no entren a TG-118.
- Els textos fixos de la pantalla són a `features/apod/strings.ts` perquè TG-91 (#319) els passi a i18next.
- `expo-router` 57.0.25 (no 57.0.28): és la que registra `expo` 57.0.27 i no obliga a canviar `expo-constants`.

## Canvis al vault

- [[frontend]]: l'avís d'estat ja reflecteix que hi ha `src/app`, `src/shared/theme` i `src/shared/ui`.

## Pendent / següents passos

- [ ] Confirmar els valors del gel al tema `vermell` que `tokens.md` no fixa (premut i vora): s'han reutilitzat valors existents del tema, marcats «to confirm» al codi.
- [ ] El mockup de la incepció (fosc, tipografia pixel) no coincideix amb l'estètica «Cel viu» de l'[[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]; s'ha seguit l'ADR.
- [ ] Afegir `* text=auto eol=lf` al `.gitattributes`: a Windows el checkout amb CRLF fa fallar Prettier.
- [ ] TG-91 (#319): la data surt en anglès a Expo Go (iOS només dona a l'app els idiomes que declara). Cal passar l'idioma d'i18next a `formatApodDate(date, locale)`, que ja l'accepta; `expo-localization` és de #314/#315.
- [ ] TG-119 (multimèdia), TG-120 (estats de càrrega i error) i TG-121 (proves).
- [ ] Regenerar el contracte amb l'OpenAPI real quan TG-47 estigui fusionada.

## US de Taiga

- TG-48
