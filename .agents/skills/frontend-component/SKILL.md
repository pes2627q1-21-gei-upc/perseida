---
name: frontend-component
description: Crea o modifica components de UI reutilitzables del frontend (React Native + Expo) amb l'estètica Frutiger Cosmo (Cel viu), tokens de tema i components base glossy. Usa-la quan calgui un component nou (GlossyButton, GlassPanel, Toast...) o tocar `src/shared/ui`, `src/shared/theme` o `features/<mòdul>/components`.
---

# Frontend: component de UI

Crea components de presentació amb l'estètica «Frutiger Cosmo · Cel viu», només amb tokens de tema i accessibles. El component és "tonto": cap regla de negoci ni de seguretat.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. **Abans de res, invoca la skill `estetica-frutiger-cosmo`**: fixa la direcció visual, els tokens (`references/tokens.md`), les receptes de vidre i gel (`references/receptes.md`) i el procés amb `frontend-design` (dues passades) i `ui-ux-pro-max` (consultes concretes, `references/pro-rules.md` com a checklist de lliurament). No en copiïs el contingut, referencia'l. **Accessibilitat obligatòria (WCAG 2.2 AA):** tot el que es fa ha de complir la guia `references/accessibilitat.md`.

## Quan usar-la / quan NO
- Usa-la: component base a `src/shared/ui`, component de feature a `src/features/<mòdul>/components`, canvis als tokens de `src/shared/theme`.
- NO: pàgines/rutes (`frontend-pagina`), formularis (`frontend-formulari`), crides a l'API (`frontend-crida-api`), jocs i animacions complexes (`frontend-jocs-dinamics`), errors i toasts de negoci (`gestio-errors`; aquí només es construeix el component visual del toast).

## Protocol de dubtes (OBLIGATORI)
No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes concretes d'aquesta skill (abans d'escriure):
1. Existeix ja `src/shared/theme` amb tokens? Si no, es crea a partir de `estetica-frutiger-cosmo/references/tokens.md` (paleta i tipografia ja acordades). Els valors marcats «proposta a validar» (escala tipogràfica, radis, ombra de llum, breakpoints) es confirmen amb la persona abans de fixar-los.
2. Com es carrega la tipografia (M PLUS Rounded 1c + Open Sans, `expo-font`) i quines versions dels paquets `@expo-google-fonts/*` es fixen? Verifica'n l'existència abans.
3. Quin **joc d'icones** (una sola família; vectorial, mai emojis)? Encara no està decidit: pregunta.
4. El component és base compartit (`shared/ui`) o de feature? Quines variants i estats necessita (default, pressed, disabled, loading, focus)?
5. Té algun comportament especial als quatre temes (`dia`, `posta`, `nit`, `vermell`)? Per defecte, no: només llegeix tokens semàntics.
6. Cal alguna **dependència nova** (blur, gradients, svg, skia, so, hàptic)? Pregunta abans d'afegir-la; versió fixada amb pnpm (verifica'n l'existència i la versió).
7. Hi ha disseny a Figma/mockup o es dissenya amb `frontend-design`?
8. Accessibilitat (WCAG 2.2 AA): quins límits o decisions cal confirmar per a això (escala de text, anuncis `polite`/`assertive`, variant d'alt contrast, eines de test)? Vegeu les preguntes d'accessibilitat de la guia.

## Passos
1. Llegeix el vault (frontend.md, estructura del repo) i comprova si ja existeix un component o token reutilitzable.
2. Resol les preguntes anteriors. Llegeix `estetica-frutiger-cosmo` (`SKILL.md`, `references/tokens.md`, `references/receptes.md`) i `references/responsive.md`.
3. Defineix/estén els tokens a `src/shared/theme` (quatre temes; només valors acordats o confirmats per l'humà); el component consumeix tokens, mai valors literals (colors, espais, radis, ombres, durades).
4. Components base glossy: `GlossyButton`, `GlassPanel`, `Toast` (receptes a `estetica-frutiger-cosmo/references/receptes.md`), i els que es validin. Vidre només en capes flotants; gel només en accions; cap gradient decoratiu. NativeWind només per a layout/espaiat.
5. Estats: pressed (80–150 ms, sense canviar la mida del layout), disabled (semàntica nativa), loading, focus visible (web/admin); comprovats als quatre temes.
6. Accessibilitat: `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; tàctil ≥44×44 pt (ampliar `hitSlop` si la icona és més petita); contrast text ≥4.5:1 sobre vidre translúcid, mesurat sobre el **pitjor fons** (`estetica-frutiger-cosmo/scripts/contrast.py`); icones decoratives amagades al lector.
7. Moviment amb `react-native-reanimated` (molles de `so-i-moviment.md`); respecta `reduced motion` (alternativa sense moviment, no només més lenta). Sons: via el mòdul `sound`, amb interruptor a ajustos.
8. Textos sempre per i18n (ca/es/en) rebuts per props o `t()`; cap text cru.
9. Escriu els tests (després del codi) i passa la checklist.

## Plantilla de codi (orientativa: el repo encara no té codi)
Les receptes de `GlassPanel` (un únic `BlurTargetView` al cel) i `GlossyButton` (cos, reflex i vora separats perquè el reflex no passi sota el text) són a `../estetica-frutiger-cosmo/references/receptes.md`; no es dupliquen aquí. Forma mínima d'un component base:
```tsx
const theme = useTheme(); // tokens semàntics només: cap color, radi o espai literal
<Pressable accessibilityRole="button" accessibilityLabel={label}
           accessibilityState={{ disabled: !!disabled, busy: !!loading }}
           disabled={disabled || loading} onPress={onPress}
           style={{ minHeight: theme.touch.min, borderRadius: theme.radii.pill }} />
```
Versions de llibreries: fixades amb pnpm; pregunta/verifica abans d'afegir-ne.

## Tests (després del codi)
- Jest + React Native Testing Library per a la **lògica** (estats disabled/loading no disparen `onPress`, rols i etiquetes d'accessibilitat, ús de `t()`).
- Els components purament visuals queden exclosos de cobertura (convencions/testing.md); no persegueixis cobertura amb snapshots buits.
- Prova manual: mòbil petit, mòbil gran, tauleta, escriptori; els quatre temes (`dia`, `posta`, `nit`, `vermell`) i els quatre modes; reduced motion (vegeu `references/responsive.md`).

## Checklist final
- [ ] Protocol `vault-context` seguit; cap valor inventat (els «proposta a validar» de `tokens.md` confirmats per l'humà).
- [ ] Zero colors, espais, radis, ombres o durades literals fora dels tokens.
- [ ] Checklist de `estetica-frutiger-cosmo/references/checklist.md` i de `ui-ux-pro-max/references/pro-rules.md` passades.
- [ ] Tàctil ≥44×44 pt, rols/etiquetes/estats d'accessibilitat, contrast ≥4.5:1, focus visible.
- [ ] Reduced motion respectat; pressed sense canvi de layout.
- [ ] Textos via i18n ca/es/en.
- [ ] Sense scroll horitzontal; comprovat als 4 dispositius de la matriu.
- [ ] Tests de lògica escrits; cap dependència nova sense permís.
- [ ] Accessibilitat WCAG 2.2 AA: checklist de `references/accessibilitat.md` completada (lectors i i18n, text gran i contrast, reduce motion, teclat/focus, tests per rol/etiqueta).

## Què NO fer
- No hardcodegis valors de disseny ni inventis hexadecimals.
- No posis gloss sota el text sense comprovar el contrast, ni gradients decoratius.
- No posis regles de negoci o de seguretat al component.
- No usis emojis com a icones ni barregis famílies d'icones.
- No dupliquis la gestió d'errors: remet a `gestio-errors`.
- No editis `.claude/skills/`; la font és `.agents/skills/`.
- No afegeixis dependències sense preguntar.
