# Receptes React Native / Expo

Codi **orientatiu**: el repo encara no té `src/shared/theme` ni `src/shared/ui`. Noms de tokens de `tokens.md`. Dependències (`expo-blur`, `expo-linear-gradient`, `react-native-svg`, `@shopify/react-native-skia`, `react-native-reanimated`, `expo-font`, `expo-audio`...) **no estan instal·lades**: pregunta abans d'afegir-les, verifica la versió i fixa-la amb `pnpm`.

## Arquitectura del vidre: una escena, un target

L'escena del cel (`SkyScene`, vegeu `cel-viu.md`) és el **`BlurTargetView` únic**. Tot el vidre de l'app hi apunta amb `blurTarget`. Així Android desenfoca el cel real (no un rectangle translúcid) i el cost és el d'una sola captura.

```tsx
// src/shared/ui/SkyProvider.tsx (orientatiu)
const SkyTarget = createContext<RefObject<View | null> | null>(null);
export const useSkyTarget = () => useContext(SkyTarget);
// <SkyTarget.Provider value={ref}><BlurTargetView ref={ref} style={StyleSheet.absoluteFill}><SkyScene/></BlurTargetView>{children}</SkyTarget.Provider>
```

Fets verificats a la documentació d'`expo-blur` (SDK 57 / «latest»):
- `BlurView` accepta `intensity` (1–100, animable), `tint`, i a Android `blurMethod` (`'none'` per defecte; `'dimezisBlurViewSdk31Plus'` recomanat: cau a `'none'` per sota d'Android 12), `blurTarget` i `blurReductionFactor` (4 per defecte; ajusta'l perquè Android s'assembli a iOS).
- `borderRadius` **no s'aplica** al `BlurView`: posa'l a un wrapper amb `overflow: 'hidden'`.
- Renderitza el `BlurView` **després** del contingut dinàmic (`FlatList`), o no s'actualitza.
- Sense `blurTarget`, Android mostra una vista semitransparent.
- Verifica-ho a la versió instal·lada abans d'escriure: l'API canvia entre SDK.

## `GlassPanel`

```tsx
// src/shared/ui/GlassPanel.tsx (orientatiu)
export function GlassPanel({ children, strong }: Props) {
  const theme = useTheme();
  const target = useSkyTarget();
  const reduceTransparency = useReduceTransparency(); // AccessibilityInfo.isReduceTransparencyEnabled
  return (
    <View style={{ borderRadius: theme.radii.lg, overflow: 'hidden', borderWidth: 1,
                   borderColor: theme.colors.surface.glassBorder, ...theme.shadows.lightGlow }}>
      {!reduceTransparency && (
        <BlurView blurTarget={target} intensity={strong ? theme.blur.glassStrong : theme.blur.glassLight}
                  blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
      )}
      <View style={{ backgroundColor: reduceTransparency ? theme.colors.surface.glassSolid : theme.colors.surface.glass }}>
        {children}
      </View>
    </View>
  );
}
```

Regles:
- El **fons de `surface.glass` porta l'opacitat mínima** darrere del text (`tokens.md`): és el que fa el contrast, no el blur.
- Reflex de vora superior: 1 px `rgba(255,255,255,.5)` (una `View` absoluta de 1 px d'alçada).
- Com a màxim **2–3 `BlurView` per pantalla**, i **cap dins d'ítems de llista** (usa el fons sòlid translúcid a les files).
- Ombres a Android: evita `elevation` sobre vistes translúcides (artefactes); usa `boxShadow` (RN 0.76+) o l'ombra del wrapper opac.

## `GlossyButton` (gel)

Cos, reflex i vora **separats** perquè el reflex no passi per sota del text:

```tsx
// src/shared/ui/GlossyButton.tsx (orientatiu)
<Pressable accessibilityRole="button" accessibilityLabel={label}
           accessibilityState={{ disabled: !!disabled, busy: !!loading }}
           disabled={disabled || loading} onPress={() => { sound.tap(); onPress(); }}
           style={({ pressed }) => ({ minHeight: theme.touch.min, borderRadius: theme.radii.pill, overflow: 'hidden',
                                       ...theme.shadows.gelGlow, opacity: disabled ? 0.5 : 1 })}>
  {({ pressed }) => (
    <>
      <LinearGradient colors={pressed ? theme.gradients.gelPressed : theme.gradients.gelBody}
                      style={StyleSheet.absoluteFill} />                    {/* cos: #096AA3 → #075F94 */}
      <LinearGradient colors={theme.gradients.gelHighlight} locations={[0, 1]}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%' }}
                      pointerEvents="none" />                               {/* reflex .40 → .14, acaba al 46 % */}
      <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: theme.radii.pill, borderWidth: 1,
                     borderColor: theme.colors.gel.rim }} pointerEvents="none" />
      <Text style={theme.typography.button}>{label}</Text>
    </>
  )}
</Pressable>
```

- Premut: canvia el cos i baixa el reflex; **no** canvia la mida del layout; el contingut baixa 1 px com a màxim.
- El text (`gel.text`) va sobre el cos: comprova el contrast amb `scripts/contrast.py` si canvies colors.
- `loading`: indicador al lloc del text; `accessibilityState.busy`.

## Icones

Una **sola família** vectorial (outline o filled, no barrejades; **pregunta quina**). Mai emojis. Les icones d'**acció principal** poden anar en un orbe glossy (cercle/quadrat arrodonit amb reflex curvat i vora de llum, com l'iPhone 4); la resta d'icones d'UI són planes amb un glow suau. Decoratives amagades al lector de pantalla.

## Bombolles, estels i aurora (Skia)

- **Un sol `Canvas`** per escena; **cap `Animated.View` per partícula**. Bombolles = cercles amb `RadialGradient` (centre translúcid, vora blanca), pujada lenta 6–12 s, deriva lateral suau.
- Màxim **20–30 partícules**; menys en dispositius modestos (`Platform`/rendiment); pausa quan la pantalla perd el focus (`useIsFocused`) i en segon pla.
- Aurora: `RuntimeEffect` (shader de soroll en bandes) o `Path` amb `BlurMask`; només a `nit`/`posta`.
- `reducedMotion`: congela les partícules en una posició agradable i atura l'aurora; no les amaguis (es perd la identitat), només paren.
- Alternativa de poc cost: imatge pre-renderitzada per al cel estàtic i només la capa viva en Skia.

## Rendiment i fallbacks

- «Redueix la transparència» (`isReduceTransparencyEnabled`) → `surface.glassSolid` sense blur.
- Dispositius modestos: `blurMethod="none"` amb l'opacitat +.15.
- Prova l'APOD i les fotos darrere de vidre: el contrast es mesura sobre la imatge més clara possible, no sobre la mitjana.
- Mesura 60 fps a pantalles amb escena viva abans de donar-les per bones.
