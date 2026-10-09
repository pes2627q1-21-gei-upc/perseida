# Perseida · Obsidian Vault

[English](README.md) | **Català** | [Español](README.es.md)

Documentació del projecte **Perseida** (projecte de PES, UPC-FIB), mantinguda com un vault d'[Obsidian](https://obsidian.md) dins del monorepo. És el **context compartit** dels sis membres de l'equip i dels seus assistents de codi amb IA (Claude Code, Claude, Gemini), perquè el codi generat sigui coherent a tot l'equip.

## Propòsit

- Mantenir una única font de veritat sobre **què és el sistema i per què s'ha construït així**.
- Que qualsevol assistent parteixi de la mateixa informació que qualsevol company.
- Registrar les decisions a mesura que es prenen, per no repetir debats ja resolts.

Un fitxer d'instruccions per a agents a l'arrel del monorepo indica als assistents que han de llegir aquest context abans de fer qualsevol canvi.

## Què conté el vault

La nota d'entrada és [`00-index.md`](00-index.md): ordre de lectura, fonts de veritat i mapa de totes les carpetes.

| Àrea (carpeta) | Contingut |
|---|---|
| Arquitectura (`arquitectura/`) | Arquitectura física (un únic servidor Virtech, Docker Compose, cinc serveis), backend hexagonal, frontend, model de domini, serveis externs, contracte Spotwise i una nota per component. |
| Decisions (`decisions/`) | 15 ADR amb justificació i alternatives descartades (p. ex. Docker Compose en lloc de Kubernetes, moderació Kev-4B local, Redis només com a cache lazy). |
| Convencions (`convencions/`) | GitFlow, Definition of Done, regles de qualitat, testing, assistents d'IA, actualització del vault i convencions de les notes d'Obsidian. |
| Producte (`producte/`) | NOT list, stakeholders, èpiques i històries d'usuari. |
| Estat (`estat/`) | Estat actual (`estat-actual`) i les notes de cada sessió de treball. |
| Guies (`guies/`) | Com llegeixen i escriuen el vault els agents; arrencada. |
| Plantilles (`plantilles/`) | Plantilles d'ADR, component, convenció i sessió. |

## Treballar amb el vault

- Obre la carpeta `obsidian_vault/` com a vault a Obsidian.
- Actualitza'l **al final de cada sessió de treball** i **cada cop que es pren una decisió nova**. Actualitzar el vault quan un canvi afecta la documentació forma part de la llista de revisió de les PR.
- Prefereix notes petites i enllaçades (`[[wikilinks]]`) a documents llargs.
- No hi posis mai secrets, credencials (`.env`, tokens) ni dades personals d'usuaris: els assistents el llegeixen.
- Les notes s'escriuen en català.
- Cada nota es crea o edita amb les skills d'Obsidian (`.agents/skills`, vegeu [`AGENTS.md`](../AGENTS.md)).
- El hook `SessionStart` de Claude Code injecta l'índex i l'estat actual; la resta d'agents llegeixen `AGENTS.md`. Vegeu [com llegir el vault com a agent](guies/llegir-el-vault-com-a-agent.md).

## Regles per als assistents d'IA (resum)

- L'autor d'una PR és responsable de tot el codi que conté, l'hagi escrit ell o un assistent, i el sap explicar.
- Els assistents treballen en branques `feature/*`; no poden fusionar ni saltar-se les branques protegides.
- El codi generat amb IA passa per la mateixa CI, Quality Gate i revisió entre companys.
- Es comprova que les llibreries i APIs proposades existeixen realment; les dependències noves s'afegeixen amb `uv`/`pnpm` i versió fixada.
- Les skills d'Obsidian són obligatòries per a qualsevol fitxer del vault.
- Si una història canvia l'arquitectura o pren una decisió rellevant, el vault s'actualitza abans de fusionar la PR.

## Relacionat

[Backend](../backend/README.ca.md) · [Frontend](../frontend/README.ca.md) · [Infraestructura](../infra/README.ca.md)

## Equip

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
