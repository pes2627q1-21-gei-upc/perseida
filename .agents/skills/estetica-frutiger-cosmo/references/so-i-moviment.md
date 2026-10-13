# So i moviment

Decisió de l'equip (2026-10-13): **moviment i so actius per defecte**, amb silenci a ajustos. Inspiració: la Wii (tile que creix, rebot suau, tonets curts), no una còpia.

## Moviment

- **Resposta a l'acció** (premut, hover/focus, obrir, confirmar): sempre; és el que fa que l'app «es senti».
  - Tile / targeta: creix a escala 1,06 amb molla (`spring`: damping 14, stiffness 160) en focus/hover; torna en deixar-lo.
  - Botó gel: baixa el reflex i el cos en prémer (`duration.fast` 120 ms), sense canviar la mida del layout.
  - Sheets i toasts: entrada amb molla suau; sortida més ràpida que l'entrada (`exit-faster-than-enter`).
- **Ambient** (bombolles, estels, aurora, ones del llac): **una escena viva per pantalla**, lenta (cicles de 6–12 s). Sense parpelleig >3 Hz.
- **No de l'usuari** (entrades de pàgina «fade + slide» a cada secció, hover a cada targeta): evita'l; és el moviment genèric de plantilla. Una sola seqüència d'entrada per pantalla, i només si aporta.
- **Reduce motion** (`AccessibilityInfo.isReduceMotionEnabled`): l'ambient es congela en una posició agradable; la resposta a l'acció passa a canvi d'estat sense moviment (alternativa, no només «més lenta»).
- Biblioteca: `react-native-reanimated` (animacions d'UI) i Skia (escena). Pregunta abans d'afegir-les si no hi són.

## So

Actiu per defecte. A ajustos: **interruptor «So»** i, si cal, volum. Es respecta el mode silenci del sistema; mai so sobre àudio d'una altra app sense necessitat.

| Esdeveniment | So (preset de `scripts/generar_so.py`) | Notes |
|---|---|---|
| Tap en botó/tile | `tap` | curtíssim (~90 ms) |
| Focus / hover (web, admin) | `hover` | molt baix; mai en mòbil tàctil |
| Acció completada | `exit` | arpegi ascendent breu |
| Error | `error` | descendent, no estrident; sempre acompanyat de text/icona |
| Notificació / xat | `notificacio` | |
| Recompensa / assoliment / ratxa | `recompensa` | el més «celebratiu»; només a `frontend-jocs-dinamics` |

Cada so té un **equivalent no sonor** (text, icona, vibració lleu opcional amb `expo-haptics`): el so no és mai l'única informació.

### D'on surt cada so: pregunta a qui implementa

**No s'assumeix cap origen.** Per a cada so (o grup de sons) que cal, pregunta a la persona quina d'aquestes tres vies vol:

1. **Llibreria CC0** (p. ex. Kenney «UI Audio», dins la seva col·lecció CC0). L'agent tria els fitxers, els descarrega i **verifica la llicència a la pàgina de descàrrega** abans de copiar-los al repo.
2. **Fitxer aportat** per la persona (que n'és responsable de la llicència).
3. **Generat per l'agent amb Python**: `python .agents/skills/estetica-frutiger-cosmo/scripts/generar_so.py <preset> frontend/assets/sounds/<nom>.wav` (síntesi additiva original amb la llibreria estàndard; si el preset no s'adequa, l'agent en proposa un amb notes/decaïment i la persona l'escolta i el valida).

Prohibit: sons, jingles o mostres de la Wii/Nintendo, Windows/Microsoft, iPhone/Apple o qualsevol producte comercial. Fer «un so que s'assembli» és correcte; reutilitzar-lo no.

**Cada fitxer de so entra amb la seva entrada** a `frontend/assets/sounds/LICENSES.md`: nom, via (CC0 amb URL / aportat / generat), llicència. Sense entrada, no es fusiona.

### Reproducció

`expo-audio` (existeix; v57.0.5 verificada a npm el 2026-10-13; fixa la versió amb `pnpm` i comprova la compatibilitat amb la versió d'Expo instal·lada). Carrega els sons curts un sol cop i reutilitza'ls (no creïs un reproductor per tap). Encapsula-ho en un petit mòdul `src/shared/sound` amb `sound.tap()`, `sound.success()`... que consulta l'interruptor d'ajustos. Pregunta abans d'afegir la dependència.
