# Checklist de lliurament visual

La fan servir qui crea UI (skills `frontend-*`) i qui la revisa (`reviewer-arquitectura`). Marca cada punt amb evidència (captura, valor, test); els no aplicables s'expliquen, no s'ometen. Complementa `ui-ux-pro-max/references/pro-rules.md`, que també s'ha de passar.

## Identitat
- [ ] La pantalla/component **és reconeixible com a Perseida**: fons de cel viu, vidre només en capes flotants, gel només en accions.
- [ ] Hi ha **un sol element memorable** i la resta és calma. Es pot dir quin és.
- [ ] **Un motiu natural** per pantalla (aigua, aurora/llum o prat).
- [ ] **Cap gradient decoratiu** a la UI (només cel, gel i reflex de vidre).
- [ ] No hi ha trets de plantilla de `frontend-design` (targetes idèntiques amb la mateixa ombra grisa, etiquetes en majúscules sobre cada títol, numeració sense seqüència real).
- [ ] Una sola família d'icones (Phosphor); cap emoji.

## Tokens i temes
- [ ] Zero colors, radis, ombres, durades ni espais literals fora de `src/shared/theme`.
- [ ] Comprovat als **quatre temes**: `dia`, `posta`, `nit`, `vermell` (el vermell sense blaus ni verds, també a icones i imatges).
- [ ] Comprovat als **quatre modes**: Clar, Fosc, Seguir sistema, Seguir Sol; el tema i el cel coincideixen sempre.
- [ ] Tipografia: M PLUS Rounded 1c (títols/xifres) + Open Sans (cos); línies <80 caràcters.

## Contrast i accessibilitat (WCAG 2.2 AA)
- [ ] Text ≥4.5:1 i UI/icones ≥3:1 **sobre el pitjor fons darrere del vidre** (`scripts/contrast.py`), no sobre el fons mitjà.
- [ ] Sota el text del gel no hi ha reflex que aclareixi el cos (reflex ≤18 % a la zona del text).
- [ ] Fotos (APOD) darrere de vidre: contrast mesurat sobre la zona més clara.
- [ ] Fallback sense blur i amb «Redueix la transparència» funcional i llegible.
- [ ] *Reduce motion*: l'ambient es congela; la resposta a l'acció té alternativa sense moviment.
- [ ] Tàctil ≥44×44 pt / 48 dp; rols, etiquetes i estats d'accessibilitat; focus visible.
- [ ] Cap informació només amb color (al vermell, icona + text) ni només amb so.
- [ ] Complet també `frontend-component/references/accessibilitat.md`.

## So i moviment
- [ ] Hi ha interruptor de so a ajustos; cada so té equivalent no sonor.
- [ ] Cada fitxer de so té la seva entrada a `frontend/assets/sounds/LICENSES.md`; cap so de Nintendo/Microsoft/Apple.
- [ ] Una sola escena viva per pantalla; sense parpelleig >3 Hz.

## Moviment nou (porta de `so-i-moviment.md`)
- [ ] Cada moviment **nou** té freqüència i propòsit dits en una paraula; el que no en té no s'ha construït.
- [ ] Només `transform` i `opacity`; cap `ease-in`, cap `scale(0)`, cap `setState` per fotograma, cap pestanya que llisqui.
- [ ] Un hàptic per acció com a màxim, mai l'únic feedback.
- [ ] Jutjat en una *build* de release, no a Expo Go.

## Reforç opcional (només si les skills de tercers són instal·lades)
- [ ] Moviment revisat amb el llistó d'Emil Kowalski (`/review-animations`, manual) o, si no, amb la porta de dalt.
- [ ] Llistes, targetes i formularis estressats amb dades pitjor cas (`break-ui`): textos llargs ca/es/en, cap element, números enormes, text al 200 %. Cap commutador «Worst case» queda al codi.
- [ ] Passada d'Impeccable (`audit` natiu, `polish`) sense haver canviat paleta, tipografia ni materials. Si no hi són, es diu al lliurament i **no és motiu de bloqueig**.

## Rendiment
- [ ] Com a màxim 2–3 `BlurView` per pantalla i cap dins d'ítems de llista.
- [ ] Una sola `Canvas` de Skia; partícules ≤30; pausa sense focus/segon pla.
- [ ] 60 fps mesurats a la pantalla amb escena viva (dispositiu o emulador modest).

## Responsive
- [ ] Mòbil petit, mòbil gran, tauleta i escriptori (admin); sense scroll horitzontal; safe areas.

## Procés
- [ ] S'ha seguit `SKILL.md`: brief → `frontend-design` en dues passades → `ui-ux-pro-max` per a consultes concretes → reforç opcional (o suggeriment d'instal·lar-lo, una sola vegada) → aquesta checklist.
- [ ] Cap valor «proposta a validar» s'ha fixat sense confirmació de la persona.
