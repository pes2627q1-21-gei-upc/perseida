---
titol: "Convencions d'escriptura de les notes"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-657"]
font: "memòria §2.10; AGENTS.md; skill vault-context; TG-657 (tipus error-testing, review de la PR #137)"
etiquetes: [convencio, obsidian, frontmatter, escriptura]
---

# Convencions d'escriptura de les notes

## Regla

Tot fitxer de `obsidian_vault/` es crea i edita amb la skill `obsidian-markdown`; els `.base` amb `obsidian-bases` i els `.canvas` amb `json-canvas`.

## Frontmatter estàndard

Camps: `titol`, `tipus`, `estat`, `data`, `us`, `font`, `etiquetes`.

| Camp | Valors |
|---|---|
| `tipus` | `adr`, `arquitectura`, `component`, `convencio`, `sessio`, `guia`, `producte`, `estat`, `index`, `error-testing` |
| `estat` | `esborrany`, `vigent`, `obsoleta`; per als ADR, `proposada`, `acceptada`, `substituida`; per als `error-testing`, `obert` i `corregit` ([[retroalimentacio-de-testing]]) |
| `data` | `AAAA-MM-DD` |
| `us` | Referències de Taiga en forma `TG-NN` |
| `font` | D'on surt la informació (PR, reunió, document) |

Les llistes de `tipus` i `estat` són tancades: un valor nou s'afegeix aquí abans de crear-ne la primera nota.

## Noms i enllaços

- Noms de fitxer en kebab-case, sense accents.
- Wikilinks amb el nom del fitxer sense extensió en lloc de rutes; enllaços Markdown només per a URL externes.
- Una idea per nota; si en creix una altra, es crea una nota nova i s'hi enllaça.
- Tot en català.
- ADR numerats `NNNN-slug` (NNNN = següent número lliure).
- Es parteix de les plantilles de `plantilles/`.

## Enllaços

- [[actualitzacio-del-vault]]
- [[assistents-ia]]
- [[llegir-el-vault-com-a-agent]]
- [[0015-skills-agnostiques-i-vault-en-catala]]
