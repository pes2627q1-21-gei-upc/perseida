# Frutiger Cosmo: guia d'estètica i estructura de tokens

Direcció visual obligatòria de Perseida (decisió de l'humà, 2026-10-07). Variant espacial del Frutiger Aero, inspirada en l'iPhone 4 (iOS 4) i la Wii. Per decidir amb criteri paleta, tipografia i accessibilitat, usa `ui-ux-pro-max` i `frontend-design` (no es copien aquí).

> Tot el que és concret (hexadecimals, famílies tipogràfiques, durades exactes) és una **proposta a validar amb l'humà**. No s'ha fixat cap valor. Aquest fitxer només defineix l'estructura dels tokens i els criteris; els valors surten de la resposta de l'humà.

## Llenguatge visual
- **Base fosca còsmica glossy**: fons nit/nebulosa, degradat de blau profund a violeta.
- **Panells de vidre translúcid** amb vora brillant i reflex superior (highlight que llisca a la meitat superior).
- **Botons "gel"** aqua/cian: gradient vertical, brillantor superior, ombra suau de llum (no gris).
- **Bombolles i estels** com a decoració d'ambient (SVG), poques i amb propòsit.
- **Skeuomorfisme net** (iOS 4): profunditat, relleu subtil, textures netes; sense soroll visual.
- **Menú net blanc/blau** (Wii): canals/targetes en bombolla, espai respirable, sons suaus (opcionals, preguntar).
- **Tipografia arrodonnida humanista**; icones amables d'una sola família i estil (outline o filled, no barrejats).
- **Mode nocturn amb tint vermell opcional** per observar el cel sense perdre l'adaptació a la foscor.
- Evita els trets genèrics descrits a `frontend-design` (targetes idèntiques, eyebrows en majúscules, etc.). Gasta l'audàcia en un element memorable per pantalla.

## Restriccions de qualitat
- Contrast text ≥4.5:1 mesurat sobre el fons real darrere del vidre; icones significatives ≥3:1.
- El vidre no pot degradar la jerarquia: opacitat suficient en panells amb text.
- `expo-blur` és costós: limita'n les capes i prova rendiment en mòbils modestos; ofereix fallback sense blur.
- Reduced motion: bombolles/estels/brillantors animats es congelen o s'amaguen.

## Estructura de tokens de tema (`src/shared/theme`)
Capes: primitius -> semàntics -> de component (criteri de tokens semàntics per tema a `ui-ux-pro-max`). Els components només llegeixen tokens semàntics. Un tema per mode (cosmic dark, cosmic dark + tint vermell).

| Grup | Tokens (noms orientatius) | Valors |
|---|---|---|
| colors | `bg.base`, `bg.nebula`, `surface.glass`, `surface.glassBorder`, `accent.aqua`, `accent.cyan`, `text.primary`, `text.secondary`, `state.success/warning/danger/info`, `focus.ring` | PROPOSTA A VALIDAR: preguntar paleta |
| gradients | `gel`, `gelPressed`, `glassSheen`, `sky` (blau profund->violeta) | A VALIDAR (parades de color derivades de la paleta) |
| radii | `sm`, `md`, `lg`, `pill`, `bubble` | A VALIDAR |
| shadows | `lightGlow`, `elevation1..3` (ombres de llum, no grises) | A VALIDAR |
| blur | `glassLight`, `glassStrong` (intensitat) | A VALIDAR |
| spacing | escala amb ritme 4/8 (`xs..xxl`) | Ritme 4/8 recomanat per `pro-rules.md`; valors a confirmar |
| typography | família, escala (`caption..display`), pesos, interlineat | A VALIDAR (preguntar tipografia i càrrega) |
| iconSizes | `sm`, `md`, `lg` | A VALIDAR |
| touch | `min` (>=44 pt iOS; >=48 dp Android per `pro-rules.md`) | Mínims de `pro-rules.md` |
| breakpoints | `phoneSmall`, `phone`, `tablet`, `desktop` (+ `wide` per a admin) | PROPOSTA A VALIDAR (vegeu `responsive.md`) |
| motion | `duration.fast/base/slow`, `easing`, `spring`, `reducedMotion` | A VALIDAR; reduced motion obligatori |

Regles:
- Cap valor literal fora de `src/shared/theme`; NativeWind només per a layout/espaiat i ha de llegir els mateixos tokens (pregunta com es lliga la config de Tailwind amb els tokens).
- Cada token semàntic té valor per a tots els temes (no definir estats només per a un).
- Qualsevol token nou es proposa a l'humà abans d'afegir-lo.

## Components base glossy (llista inicial a validar)
`GlossyButton`, `GlassPanel`, `Toast` (animació reanimated, `role="alert"`, text traduït per `code`; la lògica d'errors és a la skill `gestio-errors`), i altres que l'humà aprovi (p. ex. targeta "bombolla", icona-botó, camp de text glossy).

## Preguntes obligatòries abans de fixar valors
1. Quina paleta concreta (fons, vidre, accent, estats, tint vermell)? Proposa 2-3 opcions amb justificació de contrast, sense convertir-les en definitives.
2. Quina tipografia i com es carrega?
3. Radis, intensitat de blur i durades: els proposa l'humà o es validen unes propostes?
4. Hi ha sons suaus (Wii)? Si sí, dependència i política de volum/silenci.
