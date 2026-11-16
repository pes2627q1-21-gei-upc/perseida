---
titol: "Sessió 2026-10-28: l'script tsc passa a typecheck (TG-342)"
tipus: sessio
estat: vigent
data: "2026-10-28"
us: ["TG-342"]
font: "Taiga: tasca TG-342; log del build d'EAS 16e2647e (fase RUN_EXPO_DOCTOR); frontend/package.json"
etiquetes: [sessio, frontend, eas, ci, tg-342]
---

# Sessió 2026-10-28 · L'script `tsc` passa a `typecheck`

## Objectiu

Treure l'avís d'`expo-doctor` que apareixia al build d'EAS abans de tornar a provar el login amb Google al mòbil.

## Causa

`expo-doctor` (primera fase d'EAS Build) va marcar 1 check de 20: «The following scripts in package.json conflict with the contents of node_modules/.bin: tsc». L'script `"tsc": "tsc --noEmit"` té el nom del binari de TypeScript. No va fer fallar el build (la fallada real era `Cannot find module 'babel-preset-expo'`, arreglat a TG-329), però és un avís que convé no arrossegar.

## Què s'ha fet

- `frontend/package.json`: l'script `tsc` es diu ara `typecheck` (mateixa ordre, `tsc --noEmit`).
- `.github/workflows/ci.yml`: el pas «Tipus (tsc)» executa `pnpm typecheck`, amb un comentari amb el motiu.
- READMEs de l'arrel i del frontend (ca/es/en), `frontend/AGENTS.md`, la referència de la skill `revisar-pr` (font a `.agents/`, còpia a `.claude/`) i les notes del vault [[qualitat]], [[frontend]] i [[arquitectura-fisica]].
- Els READMEs del frontend expliquen el motiu: `pnpm tsc` continua funcionant perquè pnpm recorre al binari, amb el mateix resultat perquè `expo/tsconfig.base` ja fixa `noEmit`.
- Les notes de sessió anteriors no es toquen: són un registre històric de quan l'script es deia `tsc`.

## Decisions

- Nom `typecheck`, convencional als projectes Expo i sense conflicte amb cap binari.
- El motiu es documenta als READMEs, al vault i en un comentari del workflow; `package.json` no admet comentaris.

## US de Taiga

- TG-342 (tasca #342)
