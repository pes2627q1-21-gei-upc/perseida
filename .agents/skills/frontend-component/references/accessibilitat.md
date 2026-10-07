# Accessibilitat del frontend (WCAG 2.2 AA)

Requisit del projecte: tot el que es fa al frontend (app mòbil i panell d'admin) ha de complir **WCAG 2.2 nivell AA**. Aquesta guia és comuna a totes les skills `frontend-*`; no es dupliquen aquí els criteris de `ui-ux-pro-max` (vegeu `references/pro-rules.md`), s'hi suma.

> Els valors marcats «a validar amb l'humà» són propostes: no es fixen sense confirmació. Davant qualsevol dubte, **pregunta a l'humà** (o, si ets un subagent, retorna un bloc `PREGUNTES PER A L'HUMÀ`).

## 1. Lectors de pantalla (TalkBack i VoiceOver) i i18n
- Tot element interactiu i tota imatge informativa té rol i nom accessibles: `accessibilityRole`, `accessibilityLabel`, `accessibilityHint` (si cal) i `accessibilityState` (`disabled`, `selected`, `busy`, `expanded`, `checked`).
- Icones i bombolles/estels decoratius, amagats al lector (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`).
- L'ordre de lectura coincideix amb l'ordre visual; els títols de pantalla són anunciats (`accessibilityRole="header"`).
- Els canvis dinàmics s'anuncien: toasts i errors com a *live region* (`accessibilityLiveRegion` a Android, `AccessibilityInfo.announceForAccessibility` a iOS; a web, `role="alert"`/`aria-live`). Si l'anunci és `polite` o `assertive` per a cada cas: **a validar amb l'humà**.
- **Tots els textos accessibles (labels, hints, anuncis) passen per i18next** en ca/es/en, igual que la resta de textos; cap cadena literal.

## 2. Text gran, contrast i daltonisme
- Respecta la mida de text del sistema (font scale / Dynamic Type): layouts flexibles, sense alçades fixes que tallin el text. Si cal limitar l'escala (`maxFontSizeMultiplier`): **pregunta a l'humà** el límit.
- Contrast mínim: text 4.5:1 (3:1 si és gran) i components d'UI i icones 3:1 (WCAG 1.4.3 i 1.4.11), **mesurat sobre el fons real** (vidre translúcid, gradients, blur), no sobre el token aïllat.
- No transmetre informació només amb el color (WCAG 1.4.1): afegeix icona, text o forma (p. ex. estat d'un esdeveniment, ratxa, error d'un camp).
- Variant d'alt contrast del tema «Frutiger Cosmo» (menys vidre i més contrast): **proposta a validar amb l'humà** abans d'implementar-la.

## 3. Reduce motion i fotosensibilitat
- Respecta «reduir moviment» del sistema (`AccessibilityInfo.isReduceMotionEnabled` o l'API de reduced motion de `react-native-reanimated`): ofereix una alternativa sense moviment (fade o canvi d'estat), no només una animació més lenta.
- Cap element parpelleja més de 3 vegades per segon (WCAG 2.3.1): vigila partícules, bombolles, estels i recompenses de jocs.
- El moviment que no respon a una acció de la persona (parallax, estels de fons) s'ha de poder aturar o s'atura amb reduce motion.

## 4. Teclat, focus i objectius (admin web)
- Tot el panell d'admin és operable amb teclat (WCAG 2.1.1), amb **focus visible** (2.4.7) i que no quedi tapat per capçaleres, panells o toasts (2.4.11); l'ordre de focus segueix l'ordre visual; modals atrapen i retornen el focus; hi ha enllaç per saltar al contingut.
- Objectiu tàctil/clic: l'AA exigeix ≥24×24 px (2.5.8); el projecte exigeix **≥44×44 pt** (vegeu `pro-rules.md`), que és més estricte i preval.
- Cap acció depèn només d'arrossegar: ofereix alternativa d'un sol punter (2.5.7). Cap acció depèn només d'un gest complex o de la veu.

## 5. Jocs i dinàmiques
- Alternativa accessible per a cada gest (tocar en lloc d'arrossegar), temps ajustable o sense límit de temps (2.2.1), sense dependre només del so ni del color, i feedback també per a lector de pantalla (puntuació, encert/error).
- La puntuació i els premis els decideix el backend; l'accessibilitat només afecta la presentació.

## 6. Tests
- Tests amb React Native Testing Library consultant per **rol i etiqueta** (`getByRole`, `getByLabelText`) en lloc de `testID`: si no es pot trobar per rol/etiqueta, el component no és accessible.
- Tests automàtics d'accessibilitat (p. ex. `eslint-plugin-jsx-a11y` a l'admin web, `axe`): són una **dependència nova** → pregunta a l'humà abans d'afegir-los i fixa'n la versió amb `pnpm`.

## Preguntes d'accessibilitat per fer abans d'escriure
1. Hi ha límit d'escala de text (`maxFontSizeMultiplier`) acordat?
2. Els anuncis dinàmics (toast, error) són `polite` o `assertive`?
3. S'ha de crear ja la variant d'alt contrast del tema o es deixa per a més endavant?
4. Quines eines de test d'accessibilitat es poden afegir?

## Checklist d'accessibilitat (WCAG 2.2 AA)
- [ ] Rol, nom i estat accessibles a cada element interactiu; decoratius amagats; textos per i18n (ca/es/en).
- [ ] Ordre de lectura i de focus correcte; títols de pantalla; canvis dinàmics anunciats.
- [ ] Text escalable sense retalls; contrast 4.5:1 / 3:1 sobre el fons real; informació no només amb color.
- [ ] Reduce motion respectat i sense parpelleigs >3 Hz.
- [ ] Teclat i focus visible (admin web); objectius ≥44 pt; alternativa a l'arrossegament.
- [ ] Tests per rol/etiqueta; passada de `references/pro-rules.md` de `ui-ux-pro-max`.
