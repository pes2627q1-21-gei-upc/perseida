---
name: vault-context
description: Protocol per llegir i escriure el vault d'Obsidian de Perseida (obsidian_vault/). Usa-la abans de començar qualsevol tasca de codi, arquitectura o documentació, quan es prengui una decisió, canviï l'arquitectura o acabi una sessió de treball.
---

# Protocol del vault de Perseida

El vault `obsidian_vault/` és la memòria compartida del projecte. Aquest protocol és l'ordre de feina per llegir-lo i escriure-hi.

## 1. Quan s'aplica

- Sempre a l'inici d'una tasca (llegir) i al final (escriure). És obligatòria; vegeu `AGENTS.md`.
- Cada cop que es pren una decisió o canvia l'arquitectura, en el moment, no al final.

## 2. Llegir (abans de treballar)

1. Llegeix `obsidian_vault/00-index.md` i `obsidian_vault/estat/estat-actual.md`. A Claude Code el hook `SessionStart` (`.agents/scripts/vault-context.mjs`, configurat a `.claude/settings.json`) ja els injecta; la resta d'agents els ha de llegir ells mateixos.
2. Llegeix la US a Taiga (projecte `alexga03-astronomia-pes`): descripció i criteris d'acceptació.
3. Cerca només les notes de l'àrea afectada:

| Àrea de la tasca | Carpeta del vault |
|---|---|
| Visió global, capes, fluxos | `arquitectura/` |
| Un servei o component concret | `arquitectura/components/<servei>.md` |
| Per què es va triar X | `decisions/` |
| Estil, nomenclatura, workflow | `convencions/` |
| Com fer una tasca (guies pas a pas) | `guies/` |

4. Abans de proposar una decisió tècnica, fes `Grep` a `obsidian_vault/decisions/` (tema, tecnologia, alternativa) per no repetir debats resolts.
5. Fonts de veritat, de més a menys: ADR `acceptada` > notes d'arquitectura `vigent` > README dels directoris. En cas de conflicte guanya el vault i es corregeix el README.

## 3. Escriure (mentre es treballa)

| Esdeveniment | Acció |
|---|---|
| Decisió tècnica nova | Crear `decisions/NNNN-slug.md` amb `plantilles/adr` (NNNN = següent número lliure), `estat: proposada` fins que l'equip l'accepti a la PR |
| Decisió que en substitueix una altra | Marcar l'antiga `estat: substituida`, i enllaçar-les amb wikilinks als dos sentits |
| Canvi d'arquitectura | Actualitzar la nota afectada a `arquitectura/` (`tipus: arquitectura`) i el seu camp `data` |
| Nou servei o component | Crear nota a `arquitectura/components/` amb `plantilles/component` |
| Convenció nova | Crear nota a `convencions/` amb `plantilles/convencio` |
| Nova guia pas a pas o d'onboarding | Crear nota a `guies/` (`tipus: guia`); no hi ha plantilla: copia l'estructura d'una guia existent |
| Nota nova o modificada | Frontmatter complet: `titol, tipus, estat, data, us, font, etiquetes` |

Estats d'ADR: `proposada` | `acceptada` | `substituida`. El camp `us` porta la referència de Taiga (ex. `TG-85`) i `font` d'on surt la informació (PR, reunió, document).

## 4. Al final de la sessió

1. Crea `estat/sessions/AAAA-MM-DD-<tema>.md` amb `plantilles/sessio`: què s'ha fet, decisions preses (enllaç als ADR), pendents i US.
2. Actualitza `estat/estat-actual.md`: sprint, US en curs, bloquejos.
3. Enllaça des de la sessió cada nota creada o canviada.

## 5. Eficiència

- No rellegeixis tot el vault: parteix de `00-index.md` i segueix wikilinks.
- Prioritza notes petites i específiques; no dupliquis contingut, enllaça'l.
- Escriu sempre amb la skill `obsidian-markdown` (wikilinks, frontmatter, callouts). Per fitxers `.base` usa `obsidian-bases`; per `.canvas`, `json-canvas`.

## 6. Límits

- Cap secret, credencial ni dada personal al vault.
- No inventis decisions ni dates: cita la `font`.
- No editis `.obsidian/workspace*.json`.
- No fusionis la PR sense vault actualitzat si la US canvia l'arquitectura o pren una decisió.
