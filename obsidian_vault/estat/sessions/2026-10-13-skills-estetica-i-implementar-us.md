---
titol: "Sessió 2026-10-13: estètica «Cel viu» a les skills i skill implementar-us"
tipus: sessio
estat: vigent
data: 2026-10-13
us: []
font: "treball a la branca feature/skills-improvements, sense US de Taiga (decisió de la persona); recerca sobre el Frutiger Aero (CARI, Wikipedia, docs d'Expo) i decisions de la persona responsable"
etiquetes: [sessio, skills, frontend, estetica]
---

# Sessió 2026-10-13 · Estètica «Cel viu» a les skills i skill `implementar-us`

## Objectiu

1. Fer que totes les skills i subagents de frontend i disseny apliquin la mateixa estètica «Frutiger Cosmo», amb un aspecte propi (vidre, natura, cel), i usin `frontend-design` i `ui-ux-pro-max` de manera ordenada.
2. Tenir una skill que porti una US de Taiga de cap a cap com un enginyer sènior que prefereix la solució simple.

## Què s'ha fet

- Skill nova `estetica-frutiger-cosmo` (`SKILL.md` i referències: principis, tokens, receptes, cel viu, so i moviment, checklist) i dos scripts: `contrast.py` (contrast WCAG) i `generar_so.py` (sons originals amb la llibreria estàndard de Python).
- Les skills `frontend-*` i `gestio-errors`, els subagents `frontend` i `reviewer-arquitectura` i les guies d'accessibilitat i responsive remeten a la skill nova. S'ha eliminat `frontend-component/references/frutiger-cosmo.md`, que ara viu a la skill nova. Els subagents `backend`, `frontend`, `devops` i `qa-tester` ja no porten «US actual: TG-205» fixat.
- Skill nova `implementar-us`: llegeix la US per l'MCP de Taiga (o `claude-in-chrome`, o text enganxat), pregunta el que no sap, planifica, espera aprovació, implementa amb les skills i subagents i itera fins que els criteris d'acceptació i la DoD verificable passen. Guia d'instal·lació de l'MCP a nivell d'usuari per a Claude Code, Codex, Gemini CLI, OpenCode i Copilot (cap credencial al repo).
- ADR-0020 i [[frontend]] actualitzats.

## Decisions preses

- Direcció **Cel viu**: paisatge fix (prat i llac) sota un cel de dia, posta o nit; vidre només en capes flotants; gel només en accions; cap gradient decoratiu. Quatre temes (`dia`, `posta`, `nit`, `vermell`) i quatre modes (Clar, Fosc, Seguir sistema, Seguir Sol). El tema i el cel van sempre lligats.
- Tipografia M PLUS Rounded 1c + Open Sans; motius naturals: aigua, aurora i llum, prat. Moviment i so actius per defecte.
- Els sons es trien per cas (llibreria CC0, fitxer aportat o script Python); mai de Nintendo, Microsoft o Apple.
- S'ha editat l'ADR-0020 (en lloc de crear-ne una de nova), per decisió de la persona.
- La skill `implementar-us` pot escriure a Taiga (subtasques, comentaris i estats) **sempre amb confirmació**; els punts humans de la DoD surten com a checklist pendent.
- **Desviació del pla acordat:** el cos del gel és `#075F94`, no `#0B78B5`. Amb `#0B78B5` el reflex superior baixava el contrast del text blanc a 3,9:1 (1,9:1 amb el reflex del 55 % previst). Amb `#075F94` és 6,8:1 (5,3:1 amb el reflex del 12 %).
- Decisió afegida per l'agent: la skill no mou mai la US a `Done` (requereix PR aprovada i fusionada); pot proposar fins a `Ready for test`.
- «Frutiger Cosmo» no és un cànon documentat (només ho és el Frutiger Aero): el definim nosaltres.

## Pendent / següents passos

- [ ] Validar amb la persona els valors marcats «proposta a validar» a `tokens.md`: escala tipogràfica, radis, ombra de llum, breakpoints, comportament del mode vermell i el seu interruptor.
- [ ] Decidir la família d'icones (una de sola, vectorial).
- [ ] Decidir la font de la ubicació per a «Seguir Sol» (permís de `expo-location` o ciutat triada).
- [ ] Escoltar i validar els presets de `generar_so.py` (no s'han pogut escoltar durant la sessió).
- [ ] Quan s'implementi, mesurar el rendiment del blur i de l'escena Skia en un mòbil modest.
- [ ] Prova real de `implementar-us` amb una US (p. ex. TG-48) fins a la porta del pla.
- [ ] Les credencials de l'MCP de Taiga ara són en clar al fitxer d'usuari de l'eina (fora del repo); valorar-ne l'alternativa si l'equip ho demana.

## US de Taiga

- Cap (feina sense US, per decisió de la persona).
