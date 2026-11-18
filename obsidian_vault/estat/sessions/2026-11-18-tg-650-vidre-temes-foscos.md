---
titol: "Sessió 2026-11-18: vidre més opac als temes nit i vermell (TG-650)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-650"]
font: "Taiga: issue TG-650; decisions de la persona en aquesta sessió (18/11/2026); contrastos amb contrast.py de la skill estetica-frutiger-cosmo; proves locals amb Jest i Stryker"
etiquetes: [sessio, frontend, tema, accessibilitat]
---

# Sessió 2026-11-18 · Vidre dels temes nit i vermell (TG-650)

## Objectiu

Que el contingut dels panells de vidre es llegeixi als temes foscos, també sobre el pitjor fons real (la lluna del cel o les etiquetes clares del mapa), no només sobre el cel.

## Què s'ha fet

- **Tokens:** `surface.glass` de `nit` passa de `rgba(255,255,255,0.12)` a `rgba(10,20,48,0.80)` (el tint fosc de `posta`) i el de `vermell`, de `rgba(255,107,94,0.10)` a `rgba(20,6,10,0.80)` (el `sky.top` del tema, sense blau ni verd). Fitxer: `frontend/src/shared/theme/colors.ts`.
- **Token nou `surface.onGlass`:** capa damunt d'un panell de vidre (botó premut a `TopBar`, `QuietButton`, `EventSheet` i `QuizOption`; camps de `TextField`, `EventField` i `PostForm`; xips de `ProfileScreen` i insígnia de `ComingSoonTab`). Amb el vidre fosc, fer servir `surface.glass` per a aquestes capes deixava l'estat premut i els camps gairebé invisibles (vidre fosc sobre vidre fosc, ~1.04:1; troballa de `reviewer-arquitectura`). Els valors són els del vidre antic de cada tema, de manera que l'aspecte d'aquestes capes no canvia i no s'inventa cap color.
- **Test (TDD, primer en vermell):** `frontend/src/shared/theme/glassColors.test.ts` comprova que el vidre dels temes foscos és ≥ 60 % opac, que el text primari, el secundari i la marca fan ≥ 4.5:1 a través del vidre sobre el pitjor fons de `nit` i `vermell`, que `onGlass` es distingeix del panell (≥ 1.1:1, com les capes del llac) amb el text primari a ≥ 4.5:1, que a `dia` i `posta` `onGlass` és el mateix vidre (sense canvi d'aspecte) i que el vidre de `vermell` no té blau ni verd. Els ternaris de l'estat premut d'`EventSheet` i `QuizOption` porten `Stryker disable next-line all` perquè són estil visual (`convencions/testing.md`).
- **Brief:** `.agents/skills/estetica-frutiger-cosmo/references/tokens.md` (valors, contrastos recalculats i nota a «Vidre»), sincronitzat a `.claude/skills/`.

## Decisions

Cap ADR nova (canvi de valors de tokens dins de l'ADR-0020). Decisions de la persona:

- Opacitat `.80` amb vidre fosc als dos temes. Amb `.62` (com `posta`) el text secundari i la marca no arribaven a 4.5:1 sobre fons clars.
- Una sola PR per a TG-650, prioritzant el temps de CI i de revisió: l'opacitat ja resol el contrast. El difuminat real a Android queda com a millora opcional, no com a part obligatòria de la issue.
- `surface.onGlass` entra en aquesta PR perquè la regressió de l'estat premut la provoca aquest mateix canvi.

## Contrastos (pitjor fons, vidre a `.80`)

| Tema | Fons | Primari / secundari / marca |
|---|---|---|
| `nit` | lluna `#CFE0FF` | 9.7 / 6.3 / 5.6 |
| `nit` | blanc (etiquetes del mapa) | 8.9 / 5.7 / 5.1 |
| `vermell` | llum `#FF8A7A` | 8.4 / 5.5 / 5.1 |

## Pendent / següents passos

- [ ] PR cap a `develop` quan la persona ho demani.
- [ ] (Opcional, issue a part) Difuminat real a Android. A `expo-blur` 58 no n'hi ha prou amb `blurMethod`: cal embolicar el contingut de cada pantalla en un `BlurTargetView` i passar-ne la `ref` (`blurTarget`) al `BlurView` de `GlassPanel` i de la barra de pestanyes. Cal provar el rendiment a Android ≤ 30 i si funciona sobre el mapa (WebView).
- [ ] `posta` té el mateix problema d'estat premut (vidre fosc .62 sobre vidre fosc): no s'ha tocat per no canviar un tema fora de l'abast.
- [ ] Revisar a mà els temes `nit` i `vermell` en un Android i a la web (mapa, llista i cel).

## US de Taiga

- TG-650 (issue)
