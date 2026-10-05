# Perseida · Obsidian Vault

[English](README.md) | **Català** | [Español](README.es.md)

> 🚧 **En construcció.** El vault es crea dins de la història del backlog «Obsidian Vault amb context d'arquitectura i decisions per a agents d'IA». El contingut següent descriu l'estat **previst**.

Documentació del projecte **Perseida** (projecte de PES, UPC-FIB), mantinguda com un vault d'[Obsidian](https://obsidian.md) dins del monorepo. És el **context compartit** dels sis membres de l'equip i dels seus assistents de codi amb IA (Claude Code, Claude, Gemini), perquè el codi generat sigui coherent a tot l'equip.

## Propòsit

- Mantenir una única font de veritat sobre **què és el sistema i per què s'ha construït així**.
- Que qualsevol assistent parteixi de la mateixa informació que qualsevol company.
- Registrar les decisions a mesura que es prenen, per no repetir debats ja resolts.

Un fitxer d'instruccions per a agents a l'arrel del monorepo indica als assistents que han de llegir aquest context abans de fer qualsevol canvi.

## Què conté el vault (previst)

| Àrea | Contingut |
|---|---|
| Arquitectura | Arquitectura física (un únic servidor Virtech, Docker Compose, cinc serveis), backend hexagonal, client mòbil amb suport offline, models de domini/UML. |
| Decisions | Decisions tècniques amb justificació i alternatives descartades (p. ex. Docker Compose en lloc de Kubernetes, planificador dins del procés, moderació Kev-4B local, Redis només com a cache). |
| Convencions | GitFlow, plantilla de PR i llista de revisió, Definition of Ready/Done, regles de qualitat (`ruff`, `mypy`, ESLint, Prettier, Quality Gate de Sonar), estratègia de testing i estructura dels jocs de prova. |
| Estat del projecte | Estat actual i què s'ha fet a cada sessió de treball. |
| Producte | Resum de la incepció: NOT list, stakeholders, èpiques i històries d'usuari, contractes de servei amb Spotwise. |

## Treballar amb el vault

- Obre la carpeta `obsidian_vault/` com a vault a Obsidian.
- Actualitza'l **al final de cada sessió de treball** i **cada cop que es pren una decisió nova**. Actualitzar el vault quan un canvi afecta la documentació forma part de la llista de revisió de les PR.
- Prefereix notes petites i enllaçades (`[[wikilinks]]`) a documents llargs.
- No hi posis mai secrets, credencials (`.env`, tokens) ni dades personals d'usuaris: els assistents el llegeixen.

## Regles per als assistents d'IA (resum)

- L'autor d'una PR és responsable de tot el codi que conté, l'hagi escrit ell o un assistent, i el sap explicar.
- Els assistents treballen en branques `feature/*`; no poden fusionar ni saltar-se les branques protegides.
- El codi generat amb IA passa per la mateixa CI, Quality Gate i revisió entre companys.
- Es comprova que les llibreries i APIs proposades existeixen realment; les dependències noves s'afegeixen amb `uv`/`pnpm` i versió fixada.

## Relacionat

[Backend](../backend/README.ca.md) · [Frontend](../frontend/README.ca.md) · [Infraestructura](../infra/README.ca.md)

## Equip

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
