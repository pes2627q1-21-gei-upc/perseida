---
titol: "Actualització del vault"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.1, §2.4.3, §2.4.4, §2.10"
etiquetes: [convencio, vault, actualitzacio, dod]
---

# Actualització del vault

## Regla

El vault és el context compartit de l'equip i dels agents; ha de reflectir la realitat del projecte. Si la US canvia l'arquitectura o pren una decisió rellevant, el vault s'actualitza abans de fusionar la PR (criteri de [[definition-of-done]]).

## Quan s'actualitza

- Tota US que canvia l'arquitectura o pren una decisió: abans de fusionar la PR.
- Al final de cada sessió de treball.
- Cada cop que es pren una decisió nova, en el moment.

## Com s'actualitza

| Esdeveniment | Nota | Plantilla |
|---|---|---|
| Decisió tècnica nova | ADR nou a `decisions/NNNN-slug.md` | `plantilles/adr` |
| Canvi d'arquitectura | Nota afectada a `arquitectura/` i el seu camp `data` | la de la nota |
| Nou servei o component | Nota a `arquitectura/components/` | `plantilles/component` |
| Convenció nova | Nota a `convencions/` | `plantilles/convencio` |
| Nova guia pas a pas o d'onboarding | Nota a `guies/` (`tipus: guia`) | cap; copia l'estructura d'una guia existent |
| Fi de sessió | `estat/sessions/AAAA-MM-DD-<tema>.md` i `estat/estat-actual.md` | `plantilles/sessio` |

Les notes s'escriuen amb la skill `obsidian-markdown` (vegeu [[notes-obsidian]]).

## Qui

- L'autor de la PR escriu l'actualització.
- El revisor ho comprova amb la llista de la plantilla de PR (`.github/pull_request_template.md`).
- Els assistents d'IA segueixen el mateix protocol (vegeu [[assistents-ia]]).

## Què no s'hi posa mai

Secrets, fitxers `.env`, tokens ni dades personals.

## Enllaços

- [[definition-of-done]]
- [[assistents-ia]]
- [[notes-obsidian]]
- [[llegir-el-vault-com-a-agent]]
- [[estat-actual]]
