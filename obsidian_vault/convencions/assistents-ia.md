---
titol: "Ús d'assistents de codi d'IA"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.10, §2.4.4"
etiquetes: [convencio, ia, agents, skills, claude-code]
---

# Ús d'assistents de codi d'IA

## Regla

Els assistents són un suport: la persona que obre la PR és responsable de tot el codi que hi conté, l'hagi escrit ella o un assistent.

## Eines

- Claude Code: assistent agèntic que treballa sobre el monorepo; eina principal de desenvolupament.
- Assistents conversacionals (Claude, Gemini): consultes puntuals, conceptes i esborranys de disseny o documentació.
- Cada membre pot triar l'assistent, però tots segueixen el mateix procés i regles.

## Context compartit

Els assistents parteixen del vault d'Obsidian (arquitectura, decisions, convencions, estat i sessions), que s'actualitza al final de cada sessió i en cada decisió nova (vegeu [[actualitzacio-del-vault]]).

- `AGENTS.md` és el fitxer canònic d'instruccions; `CLAUDE.md` l'importa i `GEMINI.md` hi apunta.
- Skill `vault-context`: protocol de lectura i escriptura del vault.
- Hook `SessionStart` de Claude Code (`.claude/settings.json`): injecta l'índex i l'estat del vault.
- Skills d'Obsidian obligatòries: `obsidian-markdown` per a tot fitxer del vault, `obsidian-bases` per a `.base` i `json-canvas` per a `.canvas`. Per llegir pàgines web s'usa `defuddle`.
- `.agents/skills/` és la font única de les skills; `.claude/skills/` és una còpia generada amb `node .agents/scripts/sync-skills.mjs` i no s'edita a mà. El workflow `skills-sync-check` verifica la sincronització.

## Procés

1. Inici: l'assistent llegeix el context compartit i la US i els criteris d'acceptació a Taiga.
2. Desenvolupament: per defecte en una branca `feature/*` (només en `hotfix/*` o `release/*` si la persona ho demana explícitament); la persona revisa cada canvi abans del commit i executa tests i linters en local. A la lògica de domini (TDD), el test l'escriu o el valida una persona abans que l'assistent proposi la implementació.
3. PR: mateixes portes que la resta (CI, Quality Gate, revisió d'una altra persona); la plantilla de PR té una casella per indicar si s'ha usat un assistent i en quines parts.
4. Tancament: si s'ha pres una decisió nova, s'actualitza el vault.
5. Retrospectiva: es valora en quines tasques han ajudat, quins errors s'han detectat i com millorar el context.

Usos: planificació i disseny (esborranys revisats per l'equip), codi repetitiu i esquelet de tests, depuració i refactorització, tasques automatitzades dins d'una `feature/*` i documentació.

## Límits

- Cap codi s'integra si l'autor no l'entén i no el pot explicar al revisor.
- Mai es comparteixen amb els assistents secrets ni credencials (`.env`, tokens) ni dades personals d'usuaris.
- Es comprova que llibreries, funcions i paràmetres proposats existeixen; les dependències noves s'afegeixen amb `uv` o `pnpm` i versió fixada.
- Els assistents no fan push, merge ni PR si la persona no ho demana, i no poden fusionar codi ni saltar-se regles: `develop` i `main` estan protegides (vegeu [[gitflow]]).

## Enllaços

- [[definition-of-done]]
- [[gitflow]]
- [[actualitzacio-del-vault]]
- [[notes-obsidian]]
- [[llegir-el-vault-com-a-agent]]
- [[0014-context-compartit-per-a-assistents-d-ia]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
