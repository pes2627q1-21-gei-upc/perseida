---
titol: "Skills agnòstiques, AGENTS.md canònic i vault en català"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85"]
font: "sessió de treball del 2026-10-07 (TG-85); AGENTS.md"
etiquetes: [adr, ia, agents, skills, obsidian]
---

# ADR-0015 · Skills agnòstiques, AGENTS.md canònic i vault en català

## Context

Per implementar la US TG-85 (vault d'Obsidian com a context per a agents d'IA, vegeu [[0014-context-compartit-per-a-assistents-d-ia]]) calia decidir com es distribueixen les skills dels agents, quin fitxer d'instruccions és canònic i en quin idioma s'escriuen les notes. Claude Code només llegeix `.claude/skills/`. Decisions preses a la sessió de treball del 2026-10-07.

## Decisió

- Les skills viuen vendoritzades a `.agents/skills/` (font única, estàndard obert) i un script Node (`.agents/scripts/sync-skills.mjs`) les copia a `.claude/skills/`. Aquesta còpia està versionada (committed), és generada (no s'edita a mà) i el workflow de CI `skills-sync-check` (`sync-skills.mjs --check`) falla si diverge de `.agents/skills/`.
- `AGENTS.md` és el fitxer canònic; `CLAUDE.md` l'importa (`@AGENTS.md`) i `GEMINI.md` hi apunta.
- Skill `vault-context` i hook `SessionStart` de Claude Code per injectar el context del vault.
- Les notes del vault s'escriuen només en català.
- L'ús de les skills d'Obsidian (kepano/obsidian-skills, llicència MIT, commit `3ccff5338ea700537839b21900aa5358a0402c98`) és obligatori; s'hi inclouen les sis, també `defuddle` i `knap`.

## Conseqüències

### Positives

- Una única font per a les skills, vàlida per a tots els agents; la divergència amb la còpia de Claude Code es detecta a la CI.
- Com que `.claude/skills/` és versionada, Claude Code hi troba les skills després del clon amb només executar l'script de sincronització que indica `AGENTS.md`.
- Versió de les skills d'Obsidian fixada per commit.
- Un sol idioma al vault, amb menys manteniment.

### Negatives (assumides)

- `.claude/skills/` és una còpia generada que s'ha de regenerar amb l'script un cop per clon i no s'edita a mà.

## Alternatives descartades

- Instal·lació com a plugin o marketplace de Claude Code: versió flotant i acceptació per màquina.
- Còpies versionades editables a mà, sense generació ni verificació: acaben divergint.
- Enllaç simbòlic de git (symlink): fràgil a Windows.
- Només quatre skills d'Obsidian: la persona va triar incloure'n les sis, amb `defuddle` i `knap`.
- Notes en anglès o trilingües: més manteniment.

## US de Taiga relacionades

- TG-85 (vault d'Obsidian)

## Enllaços

- [[assistents-ia]]
- [[notes-obsidian]]
- [[actualitzacio-del-vault]]
- [[llegir-el-vault-com-a-agent]]
- [[estat-actual]]
- [[0014-context-compartit-per-a-assistents-d-ia]]
