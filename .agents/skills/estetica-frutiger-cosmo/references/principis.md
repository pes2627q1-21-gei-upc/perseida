# Principis: què és «Frutiger Cosmo · Cel viu»

## Origen i referents

El **Frutiger Aero** (≈2004–2013) és l'estètica tecnològica optimista de Windows Vista/7 (Aero Glass), Mac OS X Aqua, l'iPhone OS 1–6, la Wii, la DSi/3DS, el Zune i la PSP. Les fonts documentades (CARI, Wikipedia) en destaquen: interfície skeuomòrfica, brillantor (*gloss*), materials de vidre translúcid, aurora boreal, bokeh, aigua i herba. Els subgèneres de fans (Technozen, Eco, Dark Aero) no estan documentats per cap font acadèmica: són una referència, no un cànon.

**«Frutiger Cosmo» és la nostra variant:** materials Aero (vidre, gel, bombolles, llum) sobre un cel que va de dia a nit, amb un paisatge de prat i llac. Per tant, tot el que diu aquest document és decisió de l'equip, no una norma externa.

| Referent | Què en prenem |
|---|---|
| Menú de la Wii | Graella de «canals» arrodonits, base clara i neta, barra inferior corbada amb rellotge gran, botons píndola, sons suaus, cursor amb efecte de creixement |
| Windows 7 / Vista | Vidre translúcid amb vora blanca interior i reflex, fons de paisatge (Bliss, Harmony, Aurora), glow de llum |
| iPhone 4 (iOS 4) | Icones glossy de quadrat arrodonit, relleu subtil, profunditat neta |
| Zune HD / PSP XMB | Versió fosca: tipus gran, llum de color, ones/aurora al fons |

## Trets essencials (cal que hi siguin)

1. **Gloss**: un reflex lluminós al terç/meitat superior d'un control, amb vora suau. És el senyal més fort del gènere.
2. **Vidre translúcid** amb desenfocament, vora blanca d'1 px i una ombra gran i suau.
3. **Geometria arrodonida**: píndoles, quadrats arrodonits, bombolles.
4. **Optimisme tecnològic + natura**: aigua neta, cel, llum.
5. **Llum suau**: bokeh, ratlles de llum, aurora, no ombres grises dures.

## Clixés (evita'ls o dosifica'ls)

Fotos d'estoc d'herba amb gotes, peixos tropicals, papallones de clip-art, bombolles a tot arreu, reflexos sota cada objecte, gradients a tot. **Un motiu natural per pantalla.** Si l'element ja és al cel de fons, no el repeteixis a la UI.

## Els gradients, ben usats

- Els originals feien servir gradients **petits i funcionals** a la UI (gel = cos sòlid amb un reflex a dalt) i **grans només al fons** (Aurora, Harmony, XMB).
- Perseida: cap gradient decoratiu a la UI. Només (a) el cel del fons, (b) el gel del botó i (c) el reflex de vidre. Si dubtes, treu-lo.

## Antipatrons

- Text directament sobre vidre amb un fons ocupat. Apple va rebre crítiques per això amb el Liquid Glass (contrast baix, fatiga visual). Solució: opacitat mínima darrere el text (`tokens.md`), contrast mesurat sobre el pitjor fons.
- Reflex (gloss) sota el text sense comprovar el contrast: el reflex aclareix el cos del botó. Hi ha un cos de gel calculat per aguantar-ho (`tokens.md`).
- Massa animació ambiental: com a màxim una escena viva per pantalla; es congela amb *reduce motion*.
- Cada targeta igual, un sol radi a tot, la mateixa ombra grisa (trets genèrics de `frontend-design`): fes que jerarquia = material (el que sura té vidre; el que és acció té gel; el que és contingut és net).
- Els trets de plantilla: etiquetes en majúscules sobre cada títol, números 01/02/03 sense seqüència real, mono-espaiat per a dades petites, fletxes «→» a cada enllaç.

## L'element memorable

Cada pantalla gasta l'audàcia en **una sola cosa**; la resta, calma. Exemples: l'APOD gran amb el vidre de la descripció que se submergeix al llac; el comptador de la pluja d'estels amb el rellotge a la barra corba estil Wii; l'aurora que s'encén quan el quiz es completa. Si no pots dir quin és l'element memorable d'una pantalla, encara no està dissenyada.

## Fonts

- CARI: https://cari.institute/aesthetics/frutiger-aero
- Wikipedia, «Frutiger Aero» i «Liquid Glass».
- Iwata Asks, canals de la Wii: https://iwataasks.nintendo.com/interviews/wii/wii_channels/0/1
- Crítica d'accessibilitat al Liquid Glass: https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/
