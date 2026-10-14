# Tokens de tema (`src/shared/theme`)

Capes: **primitius → semàntics → de component**. Els components només llegeixen tokens semàntics. Quatre temes: `dia`, `posta`, `nit`, `vermell`. Cap valor literal fora de `src/shared/theme`. NativeWind només per a layout/espaiat i ha de llegir els mateixos tokens (pregunta com es lliga la config de Tailwind abans de tocar-la).

Estat dels valors: **acordats** amb la persona el 2026-10-13, llevat dels marcats *(proposta a validar)*. Els contrastos s'han calculat (WCAG 2.x, relació de luminància) contra el fons real darrere del vidre. Si canvies un valor, recalcula'l.

## Colors per tema

| Token semàntic | `dia` | `posta` | `nit` | `vermell` |
|---|---|---|---|---|
| `sky.top` | `#5EC8F2` | `#2B2F6B` | `#0A1430` | `#14060A` |
| `sky.low` (horitzó) | `#BFE9F7` | `#E8885A` | `#13265A` | `#2A0B12` |
| `surface.glass` (fons de vidre) | `rgba(255,255,255,.78)` | `rgba(10,20,48,.62)` | `rgba(255,255,255,.12)` | `rgba(255,107,94,.10)` |
| `surface.glassSolid` (fallback opac, sense blur) | `#F4FBFE` | `#1B2350` | `#22305F` | `#3A141A` |
| `surface.glassBorder` | `rgba(255,255,255,.65)` | `rgba(255,255,255,.28)` | `rgba(255,255,255,.28)` | `rgba(255,140,125,.30)` |
| `text.primary` | `#10223F` | `#EAF4FF` | `#EAF4FF` | `#FFB3A7` |
| `text.secondary` | `#3A4F6E` | `#B4C6E6` | `#B4C6E6` | `#E08A7E` |
| `brand` (text/enllaç) | `#4B4BD8` | `#B3B3FF` | `#B3B3FF` | `#FF6B5E` |
| `brand.fill` (només emplenat, no text) | `#5B5BF0` | `#5B5BF0` | `#5B5BF0` | `#FF6B5E` |
| `accent.glow` | `#1FA8E0` | `#2EE6D6` | `#2EE6D6` | `#FF8A7A` |
| `state.success` | `#2A7419` | `#6FD65A` | `#6FD65A` | `#FFB3A7`* |
| `state.warning` | `#8A5A00` | `#F2B33D` | `#F2B33D` | `#FFB3A7`* |
| `state.danger` | `#B3261E` | `#FF9A92` | `#FF9A92` | `#FFB3A7` text · `#FF6B5E` vora i icona* |
| `focus.ring` | `#0B78B5` | `#2EE6D6` | `#2EE6D6` | `#FF8A7A` |

\* **Estats al tema `vermell`** (acordat el 2026-10-13: «vermell + pes visual»): no hi ha verd ni groc (destrueixen l'adaptació a la foscor) i només hi ha un vermell. L'estat es distingeix per la **jerarquia visual**, sempre amb **icona + text**:
- `perill`: vora de 2 px `#FF6B5E` i fons `rgba(255,107,94,.18)`, icona de perill i text `#FFB3A7` (6.8:1). `#FF6B5E` és només vora i icona (UI ≥3:1, 4.2:1 sobre aquest fons), **mai text** sobre el fons de perill.
- `èxit` i `avís`: sense vora ni fons; només icona (check / triangle) i text `#FFB3A7`.

Primitius de natura (decoratius, sense text a sobre): prat `#6DBE45` / `#3FA535`, llac `#3FA9DE`, aurora `#2EE6D6` / `#4CFF9A` / `#7B5CFF`. El verd de prat `#4FB33A` **no** és un color de text (2.3:1 sobre vidre de dia).

## Gel (botó d'acció principal)

| Token | Valor | Notes |
|---|---|---|
| `gel.body` | gradient vertical `#096AA3` → `#075F94` | només per al cos del botó; subtil i funcional |
| `gel.bodyPressed` | `#054B73` | estat premut: sense canvi de mida |
| `gel.highlight` | `rgba(255,255,255,.40)` a dalt → `.14` al límit | cobreix el 42–48 % superior; vora inferior suau |
| `gel.rim` | `#1FA8E0` (vora interior d'1 px, 50 %) | és l'«aqua» visible; no porta text |
| `gel.text` | `#FFFFFF` | |
| `gel.glow` | `#1FA8E0` a `.60`, `0 8 20` | ombra de llum, no grisa |

**Regla de contrast del gel:** el reflex aclareix el cos. El text blanc ha de quedar per sota del reflex: el reflex acaba al ≤48 % de l'alçada i l'alfa a la zona del text és ≤.14. Contrast mesurat: cos `#075F94` 6.83:1; amb reflex del 12 % 5.25:1; amb el del 18 % 4.58:1. Amb el cos `#0B78B5` (l'«aqua» pur) cau a 3.92:1 amb el reflex del 12 %: **no usar-lo com a cos amb text**. Al tema `vermell`, el gel és `#FF6B5E` amb text `#1A0508` (7.03:1). Al tema `nit`/`posta` el cos és el mateix.

## Contrastos verificats (text ≥4.5:1; UI/icones ≥3:1)

| Parell | Ràtio |
|---|---|
| `dia` text primari `#10223F` sobre vidre sobre cel `#5EC8F2` (≈`#DCF3FC`) | 13.8 |
| `dia` text secundari `#3A4F6E` sobre el mateix | 7.2 |
| `dia` marca `#4B4BD8` / èxit `#2A7419` / avís `#8A5A00` / perill `#B3261E` | 5.5 / 5.1 / 5.2 / 5.7 |
| `dia` focus `#0B78B5` (UI) | 4.2 |
| `posta` text `#EAF4FF` sobre vidre sobre cel `#2B2F6B` / `#E8885A` | 14.4 / 8.3 |
| `posta` text secundari `#B4C6E6` sobre vidre sobre l'horitzó `#E8885A` | 5.3 |
| `nit` text `#EAF4FF` / secundari `#B4C6E6` sobre vidre sobre `#13265A` | 9.1 / 5.9 |
| `nit` cian `#2EE6D6`, èxit `#6FD65A`, avís `#F2B33D`, marca `#B3B3FF`, perill `#FF9A92` | 6.5 / 5.5 / 5.4 / 5.2 / 5.0 |
| `vermell` text `#FFB3A7` / secundari `#E08A7E` / accent `#FF6B5E` | 9.2 / 6.1 / 5.6 |
| `vermell` perill: text `#FFB3A7` sobre el fons de perill / vora i icona `#FF6B5E` (UI) | 6.8 / 4.2 |
| `glassSolid` (mínim dels textos i estats de cada tema) | `dia` 5.6 · `posta` 7.3 · `nit` 6.2 · `vermell` 5.8 |
| gel: blanc sobre `#075F94` (amb reflex 12 %) | 6.8 (5.3) |

Reprodueix-los amb `python .agents/skills/estetica-frutiger-cosmo/scripts/contrast.py FG BG [--glass COLOR ALFA]` (p. ex. `contrast.py "#10223F" "#5EC8F2" --glass "#FFFFFF" 0.78` → 13.81). Recalcula'ls si canvies el fons o l'opacitat del vidre. **Mesura sempre sobre el pitjor fons possible** (la zona més clara o més saturada del cel darrere del vidre).

## Vidre

| Token | Valor |
|---|---|
| `blur.glassLight` | intensitat 40 (targetes, tab bar) |
| `blur.glassStrong` | intensitat 70 (sheets, modals) |
| Opacitat mínima darrere de text | **≥ .60 en fosc, ≥ .75 en clar** (ja a `surface.glass`) |
| Vora | 1 px `surface.glassBorder`, més un reflex de 1 px a dalt (`rgba(255,255,255,.5)`) |
| Ombra | llum, no grisa, **marcada**: `0 10 32` amb `accent.glow` al 30 %. Vigila el cost a Android i que no embruti el cel de dia |
| Fallback sense blur | `surface.glassSolid`: color **opac** per tema (taula), no «més opacitat»: als temes foscos més blanc empitjora el contrast. S'usa amb «Redueix la transparència» del sistema i en dispositius modestos. Contrast verificat ≥5.5:1 a tots els textos i estats dels quatre temes |

## Tipografia

| Rol | Família | Càrrega |
|---|---|---|
| Títols, rellotge, xifres | **M PLUS Rounded 1c** (500, 700) | `expo-font` + `@expo-google-fonts/m-plus-rounded-1c` |
| Cos i etiquetes | **Open Sans** (400, 600) | `expo-font` + `@expo-google-fonts/open-sans` |

Verifica l'existència i fixa la versió amb `pnpm` abans d'afegir els paquets (regla 7 d'AGENTS.md). Escala acordada: `caption 12 / body 16 / bodyStrong 16-600 / title 20 / headline 26 / display 44` (el rellotge i els comptadors, a `display`) (rellotge). Interlineat 1.5 al cos; línies de <80 caràcters. Només pesos 400/500/600/700 (cap pes fi sobre vidre).

## Radis, espaiat, tàctil, moviment

| Grup | Valors |
|---|---|
| `radii` | `sm 8`, `md 12`, `lg 18`, `pill 999`, `bubble 999` (tipus iOS 4) |
| `spacing` | ritme 4/8: `xs 4, sm 8, md 16, lg 24, xl 32, xxl 48` |
| `touch.min` | 44 pt (iOS) / 48 dp (Android); `hitSlop` si la icona és més petita |
| `iconSizes` | `sm 20, md 24, lg 32` |
| Icones | **Phosphor** (`phosphor-react-native`, 3.0.6 verificada a npm el 2026-10-13; depèn de `react-native-svg`): pes `regular` a la UI, `duotone` a les icones d'acció principal i `fill` per a l'estat seleccionat. Verifica la versió abans d'afegir-la |
| `duration` | `fast 120 ms`, `base 220 ms`, `slow 420 ms` |
| `spring` | rebot suau: `damping 14, stiffness 160, mass 1` (tile que creix: escala 1 → 1.06) |
| `breakpoints` | `phoneSmall 360`, `phone 390`, `tablet 768`, `desktop 1280`, `wide 1536` (vegeu `responsive.md` a `frontend-component`) |
| `reducedMotion` | alternativa sense moviment (no només més lenta); l'ambient es congela |

## Regles

- Cada token semàntic té valor als **quatre** temes.
- Qualsevol token nou es proposa a la persona abans d'afegir-lo.
- El tema `vermell` no té blaus ni verds, també a les icones i a les imatges (tint sobre l'APOD i altres fotos).
