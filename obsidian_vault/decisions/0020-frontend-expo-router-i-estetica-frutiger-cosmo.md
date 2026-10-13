---
titol: "Frontend: Expo Router, stack d'UI i estètica Frutiger Cosmo"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisió estètica revisada el 2026-10-13 (sessió 2026-10-13-skills-estetica-i-implementar-us); decisions de la persona responsable"
etiquetes: [adr, frontend, ui, ux, responsive]
---

# ADR-0020 · Frontend: Expo Router, stack d'UI i estètica Frutiger Cosmo

## Context

[[frontend]] deixava sense decidir l'estructura de carpetes, el sistema d'estils i la direcció visual. Els agents necessiten una guia única per generar UI coherent.

## Decisió

- **Estructura**: Expo Router amb `frontend/src/app/` (grups `(app)` per al mòbil i `(admin)` per a l'escriptori), `src/features/<mòdul>/{components,hooks,api}` i `src/shared/{ui,theme,api,errors,i18n}`.
- **Stack**: NativeWind amb *tokens* de tema propis i components base «glossy» (`expo-linear-gradient`, `expo-blur`, `react-native-svg`); `openapi-typescript` + `openapi-fetch` + TanStack Query; *toast* propi; `react-hook-form` + `zod` (validació de comoditat; la vàlida és la del backend).
- **Estètica «Frutiger Cosmo · Cel viu»**, inspirada en els menús de la Wii, Windows 7 i l'iPhone 4 (variant pròpia del Frutiger Aero; «Frutiger Cosmo» no és un cànon documentat). Fons de paisatge fix (prat i llac) sota un cel de dia, posta o nit; vidre translúcid només en capes flotants; botons de gel només per a accions; aigua, aurora i llum com a motius naturals; **cap gradient decoratiu** (els gradients grans són només el cel). Detall a la skill `estetica-frutiger-cosmo`.
  - **Temes i modes**: quatre temes (`dia`, `posta`, `nit`, `vermell`) i quatre modes a ajustos (Clar, Fosc, Seguir sistema, Seguir Sol). El tema i el cel van sempre lligats. «Seguir Sol» calcula l'altitud solar en local; el mode vermell és un interruptor que s'aplica sobre el nocturn.
  - **Paleta i tipografia** acordades el 2026-10-13: gel `#075F94` amb text blanc (el reflex superior no pot aclarir el cos sota el text), marca indi `#5B5BF0` del logotip, cian d'aurora `#2EE6D6` (només de nit), cel de dia `#5EC8F2` i de nit `#0A1430`; M PLUS Rounded 1c per a títols i xifres, Open Sans per al cos. Els contrastos estan calculats sobre el pitjor fons.
  - **Forma i llum** (acordat el 2026-10-13): radis tipus iOS 4 (8/12/18, píndola 999), escala tipogràfica compacta (cos 16, `display` 44 per al rellotge), ombra de llum marcada, breakpoints 360/390/768/1280/1536 i icones **Phosphor** (`phosphor-react-native`).
  - **Seguir Sol** és el mode per defecte. L'altitud solar es calcula en local amb la ubicació aproximada del dispositiu (`expo-location`), una ciutat triada si no hi ha permís o, si no, franges de rellotge. El mode vermell és un interruptor que només s'aplica de nit o de posta.
  - **Moviment i so** actius per defecte, amb interruptor de so a ajustos. Els sons no poden ser de Nintendo, Microsoft ni Apple; l'origen de cada so (llibreria CC0, fitxer aportat o generat amb Python) es pregunta a qui l'implementa.
- **Responsive al 100 %, mobile-first**: l'app, pensada per a mòbils actuals; el panell d'admin, per a portàtil; tot s'ha de veure bé a qualsevol resolució.
- **Accessibilitat WCAG 2.2 AA obligatòria** a tot el frontend: lectors de pantalla amb textos per i18n, text escalable, contrast i no només color, reduce motion, teclat/focus a l'admin web i jocs accessibles; es verifica amb una checklist a les skills, la revisió de `reviewer-arquitectura` i tests per rol/etiqueta (les eines automàtiques noves es consulten abans d'afegir-les).
- **Frontend «tonto»**: sense regles de negoci ni de seguretat; mai errors crus (vegeu [[0018-errors-rfc-9457-amb-codis-estables]]).
- Es vendoritzen les skills `ui-ux-pro-max` (MIT) i `frontend-design` (Apache-2.0) per decidir amb criteri. No es modifiquen: la skill pròpia `estetica-frutiger-cosmo` les orquestra (`frontend-design` en dues passades amb el brief fixat; `ui-ux-pro-max` només per a consultes concretes, mai `--design-system --persist`, perquè la seva base de dades no té Frutiger Aero i proposa estils genèrics).

> [!info] Actualització 2026-10-13
> La direcció estètica original («base fosca còsmica i glossy», paleta i tipografia per validar) s'ha substituït per «Cel viu» tal com es descriu a dalt, per decisió de la persona responsable. La resta de l'ADR no canvia.

## Conseqüències

### Positives

- Identitat visual pròpia i coherent; tots els agents parteixen de la mateixa guia.

### Negatives (assumides)

- Els efectes glossy i el blur tenen cost de rendiment que cal vigilar en mòbils modestos.
- El vidre translúcid i el reflex del gel obliguen a mesurar el contrast sobre el pitjor fons; «Redueix la transparència» té un fallback sòlid i pot exigir una variant d'alt contrast.
- Una escena de cel viu (Skia) i el blur d'Android tenen un cost que cal mesurar a mòbils modestos; per això hi ha límits (2–3 `BlurView` per pantalla, una sola `Canvas`, ≤30 partícules).
- El tema `vermell` no admet blaus ni verds: els estats s'expressen amb icona i text.

## Alternatives descartades

- Expo Router a `app/` de l'arrel, React Navigation, `StyleSheet` pur o un UI kit (Tamagui): descartats per la persona.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[frontend]]
- [[0011-client-offline-sqlite-last-write-wins]]
- [[0021-subagents-agnostics-i-generador]]
