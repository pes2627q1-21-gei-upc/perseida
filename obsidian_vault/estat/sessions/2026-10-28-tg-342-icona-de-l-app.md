---
titol: "Sessió 2026-10-28: icona de l'app amb el logo de Perseida (TG-342)"
tipus: sessio
estat: vigent
data: "2026-10-28"
us: ["TG-342"]
font: "assets/logo.png; frontend/app.json; frontend/assets/"
etiquetes: [sessio, frontend, branding, tg-342]
---

# Sessió 2026-10-28 · Icona de l'app

## Objectiu

L'APK de prova d'EAS Build mostrava la icona per defecte de la plantilla d'Expo. Es vol la del projecte a tots els llocs on es veu el logo, la icona o el favicon.

## Què s'ha fet

- Origen: `assets/logo.png` (full de marca amb la «P», el nom i una versió petita de la icona). No es toca.
- S'ha retallat la «P» amb l'òrbita i el cometa i s'ha posat sobre el fons blau fosc del logo.
- `frontend/assets/`:
  - `icon.png` (1024×1024, sense transparència).
  - `android-icon-foreground.png` (la «P» transparent, dins la zona segura del 66 %).
  - `android-icon-background.png` (fons).
  - `android-icon-monochrome.png` (silueta per a icones temàtiques d'Android 13+).
  - `favicon.png` (256×256, abans era el logo sencer de 1254×1254 i 1,6 MB).
  - `splash-icon.png` (la «P» transparent; `app.json` encara no configura cap splash).
- `frontend/app.json`: `backgroundColor` de la icona adaptativa passa a `#020510` (era el blau clar de la plantilla).
- Els tres README de l'arrel fan servir `assets/logo-wordmark.png` (la «P» i el nom, sense la icona petita ni el planeta).

## Estat

L'APK d'EAS instal·lat al mòbil (build 278df035) s'ha provat abans d'aquest canvi i l'app funciona; la icona nova encara no s'ha vist en un dispositiu perquè no s'ha fet cap build amb ella. Es veurà al proper build d'EAS.

## Decisions

- No s'ha dissenyat cap logo nou: només s'ha retallat el que ja tenia l'equip.
- La silueta monocroma és aproximada: el cometa surt com una taca. Es pot refinar si l'equip ho demana.
- La pantalla d'inici de sessió continua sense logo; afegir-lo és un canvi de UI a part.

## US de Taiga

- TG-342 (tasca #342)
