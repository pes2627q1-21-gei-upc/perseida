# Cel viu: el motor del fons

Tot el fons de l'app és una **escena** (`SkyScene`): un paisatge fix (turons de prat i un llac) sota un cel que canvia. És l'únic gradient gran de l'app i el `BlurTargetView` del vidre (vegeu `receptes.md`).

## Capes (de baix a dalt)

1. **Cel**: gradient vertical `sky.top` → `sky.low` (`tokens.md`), interpolat segons l'altitud solar.
2. **Estels i Via Làctia** (Skia): només amb el Sol per sota de l'horitzó; la densitat creix amb la foscor (vegeu fases). Pocs, sense parpelleig >3 Hz.
3. **Aurora** (Skia, `nit`): bandes cian/verd/violeta amb desenfocament; lenta. Congelada amb *reduce motion*.
4. **Turons de prat**: 2 capes de `Path` SVG (`#6DBE45` / `#3FA535` de dia; es tenyeixen cap al blau fosc de nit, no desapareixen).
5. **Llac**: reflecteix el cel (el mateix gradient invertit al 35 % d'opacitat) amb ones suaus i bombolles de vidre ascendents.
6. La UI (vidre, gel) a sobre.

**Un motiu natural destacat per pantalla** (`principis.md`): l'escena és el fons, però cada pantalla n'activa un de viu (llac amb bombolles, aurora o llum). No tots alhora.

## Els quatre modes (ajustos)

| Mode | Què decideix el tema |
|---|---|
| **Clar** | `dia` sempre |
| **Fosc** | `nit` sempre |
| **Seguir sistema** | `Appearance.getColorScheme()`: `light` → `dia`, `dark` → `nit` |
| **Seguir Sol** *(per defecte)* | segons l'altitud solar (vegeu sota); inclou `posta` |

La **posta** només existeix a «Seguir Sol». L'interruptor **mode vermell** (acordat 2026-10-13) converteix el tema en `vermell` quan el tema resolt és `nit` o `posta`; **mai de dia** (a «Clar» l'interruptor es mostra desactivat i explica per què). Totes les preferències es desen localment.

## Seguir Sol: fase segons l'altitud

- **Altitud solar** calculada **en local**, sense API (fórmula de baixa precisió de l'Almanac, ~0,01° d'error; validada amb el solstici d'estiu a Barcelona: màxim 72,05°, esperat 72,0°).
- **Font de la ubicació** (acordada 2026-10-13), per ordre: (1) **ubicació aproximada** del dispositiu amb `expo-location` (57.0.21 verificada a npm; permís només en primer pla i precisió baixa, no se'n desa res al servidor); (2) si el permís es denega o no n'hi ha, una **ciutat triada** per l'usuari; (3) si no hi ha cap de les dues, **franges de rellotge** aproximades (alba i ocàs ≈ 6–7 h i 19–21 h → `posta`; 7–19 h `dia`; la resta `nit`). La ubicació es pot reutilitzar per a les zones d'observació, però això és una altra US.
- Recalcula cada **60 s** i en tornar l'app a primer pla; no cada frame.

| Altitud del Sol | Cel | Tema d'UI |
|---|---|---|
| ≥ 10° | `dia` | `dia` |
| 10° → 0° | transició `dia` → `posta` (smoothstep) | `dia` fins a 3°, després `posta` |
| 0° → −8° | transició `posta` → `nit` | `posta` fins a −8°, després `nit` |
| < −8° | `nit` | `nit` |
| estels | opacitat 0 a −4° → 1 a −18° (fi de la nit astronòmica) | |

El **tema d'UI canvia de cop** (el text passa de fosc a clar), amb **histèresi de ±1,5°** i un fonedís de 600 ms de la capa de vidre i del text, perquè no parpellegi quan el Sol voreja el límit. El cel, en canvi, s'interpola de manera contínua. Contrast verificat als creuaments: vidre de `posta` sobre cel de dia 5,4–6,8:1; vidre de `dia` sobre cel de posta 10,5–13,1:1 (`scripts/contrast.py`).

```ts
// src/shared/theme/sunAltitude.ts (orientatiu; cal test unitari amb casos coneguts)
const rad = Math.PI / 180;
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Altitud del Sol en graus per a una data (UTC), latitud i longitud (est positiu). */
export function sunAltitude(date: Date, latDeg: number, lonDeg: number): number {
  const d = date.getTime() / 86400000 - 10957.5; // dies des de J2000.0
  const L = mod(280.46 + 0.9856474 * d, 360);
  const g = mod(357.528 + 0.9856003 * d, 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * d) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const lst = mod(280.46061837 + 360.98564736629 * d + lonDeg, 360) * rad;
  const lat = latDeg * rad;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(lst - ra)) / rad;
}
```

Casos de prova (comprovats): Barcelona (41,39 N, 2,17 E) 21-jun màxim 72,05° (≈11:53 UTC); 21-des màxim 25,18°; Pol Nord 21-jun ≈ 23,5°; mitjanit de 13-oct a Barcelona < 0°.

## Mode vermell

Per observar el cel sense perdre l'adaptació a la foscor. Tot en la família vermella (`vermell` a `tokens.md`): **sense blaus ni verds**, també a icones i imatges (l'APOD i altres fotos es tenyeixen amb una capa vermella), l'escena en vermells molt foscos, aurora i bombolles apagades o en vermell. Els estats no usen color sinó **icona + text**. Opció d'alt contrast vinculada a «Redueix la transparència».

## Rendiment

- Cel estàtic (gradient) + capes vives en un sol `Canvas`; en segon pla o sense focus, tot en pausa.
- Cel i turons poden ser una **imatge pre-renderitzada per fase** (3 imatges + fonedís) si el cost en Android modest és alt: decideix amb una mesura, no a priori.
- *Reduce motion*: ones, bombolles, estels i aurora es congelen en una posició agradable.
