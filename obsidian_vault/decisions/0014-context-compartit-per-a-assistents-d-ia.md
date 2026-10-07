---
titol: "Context compartit per als assistents d'IA"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.10, §2.10.2; AGENTS.md"
etiquetes: [adr, ia, agents, vault, context]
---

# ADR-0014 · Context compartit per als assistents d'IA

## Context

Els assistents de codi basats en IA formen part de la manera de treballar de l'equip, sempre com a suport (memòria §2.10). Perquè el codi generat sigui coherent entre els sis membres, tots els assistents han de treballar a partir de la mateixa informació.

## Decisió

El context compartit es manté al vault d'Obsidian del monorepo (`obsidian_vault/`): l'arquitectura (física i hexagonal) i les decisions amb la seva justificació, les convencions de l'equip (model de branques, Definition of Done, qualitat i proves) i l'estat actual i les sessions de treball. A l'arrel hi ha un fitxer d'instruccions per als agents (`AGENTS.md`) que els obliga a llegir aquest context abans de fer qualsevol canvi. El vault s'actualitza al final de cada sessió i en cada decisió nova, i abans de fusionar la PR si la US canvia l'arquitectura o pren una decisió rellevant (Definition of Done).

## Conseqüències

### Positives

- Qualsevol membre, i el seu assistent, parteix de la mateixa informació.
- El codi generat amb IA passa per les mateixes portes de qualitat i revisió que la resta.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-85 (vault d'Obsidian amb context d'arquitectura i decisions per a agents d'IA)

## Enllaços

- [[assistents-ia]]
- [[actualitzacio-del-vault]]
- [[definition-of-done]]
- [[llegir-el-vault-com-a-agent]]
- [[estat-actual]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
