---
name: frontend-component
description: Crea o modifica components de UI reutilitzables del frontend (React Native + Expo) amb l'estètica Frutiger Cosmo, tokens de tema i components base glossy. Usa-la quan calgui un component nou (GlossyButton, GlassPanel, Toast...) o tocar `src/shared/ui`, `src/shared/theme` o `features/<mòdul>/components`.
---

# Frontend: component de UI

Crea components de presentació amb l'estètica "Frutiger Cosmo", només amb tokens de tema i accessibles. El component és "tonto": cap regla de negoci ni de seguretat.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Abans de decidir paleta, tipografia o accessibilitat, aplica les skills `ui-ux-pro-max` (inclou `references/pro-rules.md` com a checklist de lliurament) i `frontend-design`; no en copiïs el contingut, referencia-les. La direcció visual la fixa `references/frutiger-cosmo.md`. **Accessibilitat obligatòria (WCAG 2.2 AA):** tot el que es fa ha de complir la guia `references/accessibilitat.md`.

## Quan usar-la / quan NO
- Usa-la: component base a `src/shared/ui`, component de feature a `src/features/<mòdul>/components`, canvis als tokens de `src/shared/theme`.
- NO: pàgines/rutes (`frontend-pagina`), formularis (`frontend-formulari`), crides a l'API (`frontend-crida-api`), jocs i animacions complexes (`frontend-jocs-dinamics`), errors i toasts de negoci (`gestio-errors`; aquí només es construeix el component visual del toast).

## Protocol de dubtes (OBLIGATORI)
No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes concretes d'aquesta skill (abans d'escriure):
1. Existeix ja `src/shared/theme` amb tokens? Si no, quina **paleta** concreta s'adopta (colors de fons, vidre, accent aqua/cian, estats)? No s'inventen hexadecimals: mostra les propostes de `references/frutiger-cosmo.md` com a "a validar" i espera resposta.
2. Quina **tipografia** arrodonnida humanista s'usa i amb quina llicència/càrrega (Expo Fonts)?
3. Quin **joc d'icones** (una sola família; vectorial, mai emojis)?
4. El component és base compartit (`shared/ui`) o de feature? Quines variants i estats necessita (default, pressed, disabled, loading, focus)?
5. Cal mode nocturn amb tint vermell per a aquest component?
6. Cal alguna **dependència nova** (blur, gradients, svg, so, hàptic)? Pregunta abans d'afegir-la; versió fixada amb pnpm (verifica'n l'existència i la versió).
7. Hi ha disseny a Figma/mockup o es dissenya amb `frontend-design`?
8. Accessibilitat (WCAG 2.2 AA): quins límits o decisions cal confirmar per a això (escala de text, anuncis `polite`/`assertive`, variant d'alt contrast, eines de test)? Vegeu les preguntes d'accessibilitat de la guia.

## Passos
1. Llegeix el vault (frontend.md, estructura del repo) i comprova si ja existeix un component o token reutilitzable.
2. Resol les preguntes anteriors. Llegeix `references/frutiger-cosmo.md` i `references/responsive.md`.
3. Defineix/estén els tokens a `src/shared/theme` (només els valors confirmats per l'humà); el component consumeix tokens, mai valors literals (colors, espais, radis, ombres, durades).
4. Components base glossy: `GlossyButton`, `GlassPanel`, `Toast` (veure plantilla), i els que es validin. Composició: `expo-linear-gradient` (gel, reflex superior), `expo-blur` (vidre), `react-native-svg` (bombolles, estels, icones). NativeWind només per a layout/espaiat.
5. Estats: pressed (80–150 ms, sense canviar la mida del layout), disabled (semàntica nativa), loading, focus visible (web/admin), dark per defecte.
6. Accessibilitat: `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; tàctil ≥44×44 pt (ampliar `hitSlop` si la icona és més petita); contrast text ≥4.5:1 sobre vidre translúcid (mesura'l sobre el fons real); icones decoratives amagades al lector.
7. Moviment amb `react-native-reanimated`; respecta `reduced motion` (alternativa sense moviment, no només més lenta).
8. Textos sempre per i18n (ca/es/en) rebuts per props o `t()`; cap text cru.
9. Escriu els tests (després del codi) i passa la checklist.

## Plantilla de codi (orientativa: el repo encara no té codi)
```tsx
// src/shared/ui/GlossyButton.tsx (illustrative: tokens and names to be confirmed)
import { Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/shared/theme';

type Props = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };

export function GlossyButton({ label, onPress, disabled, loading }: Props) {
  const theme = useTheme(); // tokens only: no literal colors, radii or spacing here
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={{ minHeight: theme.touch.min }}
    >
      <LinearGradient colors={theme.gradients.gel} style={{ borderRadius: theme.radii.pill }}>
        <Text style={theme.typography.button}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}
```
Versions de llibreries: fixades amb pnpm; pregunta/verifica abans d'afegir-ne.

## Tests (després del codi)
- Jest + React Native Testing Library per a la **lògica** (estats disabled/loading no disparen `onPress`, rols i etiquetes d'accessibilitat, ús de `t()`).
- Els components purament visuals queden exclosos de cobertura (convencions/testing.md); no persegueixis cobertura amb snapshots buits.
- Prova manual: mòbil petit, mòbil gran, tauleta, escriptori; clar/fosc/tint vermell; reduced motion (vegeu `references/responsive.md`).

## Checklist final
- [ ] Protocol `vault-context` seguit; cap valor inventat (paleta/tipografia validades per l'humà).
- [ ] Zero colors, espais, radis, ombres o durades literals fora dels tokens.
- [ ] Estètica Frutiger Cosmo (`references/frutiger-cosmo.md`) i checklist de `ui-ux-pro-max/references/pro-rules.md` passada.
- [ ] Tàctil ≥44×44 pt, rols/etiquetes/estats d'accessibilitat, contrast ≥4.5:1, focus visible.
- [ ] Reduced motion respectat; pressed sense canvi de layout.
- [ ] Textos via i18n ca/es/en.
- [ ] Sense scroll horitzontal; comprovat als 4 dispositius de la matriu.
- [ ] Tests de lògica escrits; cap dependència nova sense permís.
- [ ] Accessibilitat WCAG 2.2 AA: checklist de `references/accessibilitat.md` completada (lectors i i18n, text gran i contrast, reduce motion, teclat/focus, tests per rol/etiqueta).

## Què NO fer
- No hardcodegis valors de disseny ni inventis hexadecimals.
- No posis regles de negoci o de seguretat al component.
- No usis emojis com a icones ni barregis famílies d'icones.
- No dupliquis la gestió d'errors: remet a `gestio-errors`.
- No editis `.claude/skills/`; la font és `.agents/skills/`.
- No afegeixis dependències sense preguntar.
