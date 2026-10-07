---
titol: Llegir i escriure el vault com a agent
tipus: guia
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: "AGENTS.md; skill vault-context; ADR-0014 i ADR-0015"
etiquetes: [guia, agents, vault, protocol]
---

# Llegir i escriure el vault com a agent

Guia per als agents d'IA (i les persones) que treballen a Perseida. El protocol complet és a la skill `vault-context` (`.agents/skills/vault-context/SKILL.md`); aquesta nota en resumeix l'ordre.

## Per on començar

Ordre de lectura (el mateix de [[00-index]]):

1. [[estat-actual]]: sprint, US en curs i dependències.
2. [[visio-general]]
3. [[arquitectura-fisica]] i [[backend-hexagonal]]
4. [[definition-of-done]] i [[actualitzacio-del-vault]]
5. Aquesta guia.

Després, llegeix la US a Taiga (descripció i criteris d'acceptació) i obre només les notes de l'àrea afectada. No rellegeixis tot el vault: segueix els wikilinks.

## Fonts de veritat

Prioritat de més a menys:

1. ADR amb `estat: acceptada` (`decisions/`).
2. Notes d'`arquitectura/` amb `estat: vigent`.
3. README dels directoris.

Si hi ha conflicte, guanya el vault i es corregeix el README. No inventis decisions ni dates: cita la `font`.

## Convencions en afegir contingut

- Frontmatter complet: `titol`, `tipus`, `estat`, `data`, `us`, `font`, `etiquetes` (vegeu [[notes-obsidian]]).
- Escriu amb la skill `obsidian-markdown` (obligatòria); `.base` amb `obsidian-bases` i `.canvas` amb `json-canvas`.
- Noms de fitxer en kebab-case i sense accents; tot en català; wikilinks pel nom del fitxer.
- Parteix de les plantilles de `plantilles/`.
- Cap secret, `.env`, token ni dada personal.

## Com i quan escriure

- En el moment: decisió nova (ADR), canvi d'arquitectura, servei nou, convenció nova.
- Abans de fusionar la PR si la US canvia l'arquitectura o pren una decisió.
- Al final de la sessió: nota a `estat/sessions/` i actualització d'[[estat-actual]].

Detall i taula d'accions a [[actualitzacio-del-vault]].

## Claude Code i la resta d'agents

- **Claude Code**: el hook `SessionStart` injecta automàticament l'índex i l'estat actual al començament de la sessió.
- **Resta d'agents** (Codex, Gemini...): llegeixen `AGENTS.md`, que els obliga a carregar la skill `vault-context` i a llegir ells mateixos l'índex i l'estat. Vegeu [[assistents-ia]].

## Com cercar

- Parteix de l'índex i segueix els wikilinks.
- Abans de proposar una decisió tècnica, fes `Grep` a `obsidian_vault/decisions/` (tema, tecnologia, alternativa) per no repetir debats resolts.

## Enllaços

- [[00-index]]
- [[assistents-ia]]
- [[0014-context-compartit-per-a-assistents-d-ia]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
- [[arrencada]]
