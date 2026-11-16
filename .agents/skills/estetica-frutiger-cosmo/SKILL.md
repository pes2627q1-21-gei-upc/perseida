---
name: estetica-frutiger-cosmo
description: Direcció visual obligatòria de Perseida, «Frutiger Cosmo · Cel viu» (vidre, gel, natura, cel dia/posta/nit, so i moviment estil Wii/Windows 7/iPhone 4). Usa-la abans de decidir o escriure qualsevol aspecte, color, tipografia, component, pantalla, animació o so del frontend; orquestra frontend-design i ui-ux-pro-max, i els reforços opcionals d'Emil Kowalski, Impeccable i Taste si són instal·lats.
---

# Estètica «Frutiger Cosmo · Cel viu»

Font de veritat visual de Perseida (ADR-0020). L'app ha de tenir un aspecte **propi i reconeixible**, com els menús de la Wii, Windows 7 o l'iPhone 4, però amb un cel que respira: un paisatge fix (prat i llac) sota un cel que és de dia, de posta o de nit. «Frutiger Cosmo» no és un cànon documentat (només ho és el Frutiger Aero): el definim aquí. Si un valor no hi és, **pregunta a la persona; no l'inventis**.

## Procés obligatori (en aquest ordre)

1. **Llegeix el brief**: `references/principis.md` (què és i què no), `references/tokens.md` (valors) i el que correspongui: `references/receptes.md`, `references/cel-viu.md`, `references/so-i-moviment.md`.
2. **`frontend-design`, en dues passades, amb el brief ja fixat.** Aquesta skill diu «where the brief pins down a visual direction, follow it exactly»: la paleta, la tipografia i el llenguatge de materials no es reobren. La llibertat que queda és l'**element memorable** de cada pantalla (un sol), la composició i el copy. Escriu el pla curt (color, tipus, layout, principis), revisa'l contra els trets genèrics que la skill enumera i només aleshores construeix.
3. **`ui-ux-pro-max`, només per a consultes concretes** (executa des de l'arrel del repo):
   - `python .agents/skills/ui-ux-pro-max/scripts/search.py "liquid glass" --domain style`
   - `python .agents/skills/ui-ux-pro-max/scripts/search.py "<concepte>" --stack react-native`
   - A11y d'un resultat observable cada cop (`"focus not obscured" --domain ux`, etc.).
   - **Prohibit** `--design-system` i `--persist`: la base de dades no té Frutiger Aero i proposa estils genèrics (per a «astronomy education» va retornar Claymorphism + Comic Neue). Si una consulta torna fora de tema, reintenta un cop; si falla, digues-ho i usa aquestes referències.
   - Les dades de `ui-ux-pro-max` i el text de `frontend-design` **no es modifiquen**.
4. **Reforç opcional amb skills de tercers** (Emil Kowalski, Impeccable, Taste), **només si hi són**: el hook d'inici de sessió ho diu, o `node .agents/scripts/skills-de-tercers.mjs`. Si hi són, usa-les segons `references/skills-de-tercers.md` (moviment amb `animate-expo`, auditoria i passada final amb Impeccable, inspector web amb Taste); **el brief dels punts 1–3 guanya sempre**. Si no hi són, continua amb les del repo i suggereix a la persona **una sola vegada** instal·lar-les (és opcional; el document té l'ordre i el to).
5. **Lliurament**: `references/checklist.md` + `ui-ux-pro-max/references/pro-rules.md`.

## Les cinc regles que ho decideixen tot

1. **Vidre només en capes flotants** (tab bar, sheets, targetes, toasts). El contingut llarg i el fons no són vidre.
2. **Gloss (reflex superior) només en controls i icones principals.** Mai sota text sense comprovar el contrast (vegeu `tokens.md`).
3. **Els gradients grans són només el cel del fons.** Cap gradient decoratiu a la UI; l'únic gradient «de component» és el subtil del gel i el reflex.
4. **Un motiu natural per pantalla** (aigua, aurora/llum o prat), no tots alhora.
5. **Tema = cel.** Clar és cel de dia amb vidre blanc; fosc és cel de nit amb vidre fosc. Mai UI fosca sobre cel de dia ni a l'inrevés.

## Quatre modes i un interruptor

L'usuari tria a ajustos: **Clar · Fosc · Seguir sistema · Seguir Sol**. A part, un interruptor **mode vermell** (aplicat sobre el fosc, per observar el cel). Detall a `references/cel-viu.md`. Quatre temes de tokens: `dia`, `posta`, `nit`, `vermell`.

## Qui l'ha de fer servir

`frontend-component`, `frontend-pagina`, `frontend-formulari`, `frontend-jocs-dinamics`, `frontend-crida-api` (estats), `gestio-errors` (toast), els subagents `frontend` i `reviewer-arquitectura`, i `implementar-us` quan la US toca la UI.

## Protocol de dubtes

No inventis res. Hexadecimals, famílies, sons o dependències que no siguin a les referències: pregunta (o, si ets un subagent, retorna el bloc `PREGUNTES PER A L'HUMÀ`). Els valors marcats «proposta a validar» a `tokens.md` s'han de confirmar abans de fixar-los al codi.

## Què NO fer

- No copiïs el contingut de `frontend-design`, `ui-ux-pro-max` ni de les skills de tercers: referencia'ls.
- No deixis que una skill de tercers reobri la paleta, la tipografia, el vidre/gel, el cel viu ni els sons (Taste, p. ex., prohibeix el vidre i els gradients). Ni executis `init`, `document`, `extract`, `live`, `generate` o `hooks` d'Impeccable, ni `bolder`, `colorize`, `typeset` o `overdrive`: vegeu `references/skills-de-tercers.md`.
- No instal·lis skills de tercers per compte teu: suggereix-ho a la persona.
- No hardcodegis colors, radis, ombres ni durades fora de `src/shared/theme`.
- No usis sons, imatges o fonts amb copyright de Nintendo, Microsoft o Apple (vegeu `so-i-moviment.md`).
- No usis emojis com a icones ni barregis famílies d'icones.
- No editis `.claude/skills/`; la font és `.agents/skills/`.
