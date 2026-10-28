---
titol: "Sessió 2026-10-28: skills de disseny de tercers integrades amb Frutiger Cosmo"
tipus: sessio
estat: vigent
data: "2026-10-28"
us: ["TG-342"]
font: "ADR-0027; .agents/skills/estetica-frutiger-cosmo/; .agents/scripts/skills-de-tercers.mjs"
etiquetes: [sessio, frontend, skills, estetica]
---

# Sessió 2026-10-28 · Skills de disseny de tercers

## Objectiu

Que el frontend aprofiti les skills d'Emil Kowalski, Impeccable i Taste **sense perdre** l'estètica, l'estil i les decisions de «Frutiger Cosmo» i **sense obligar** ningú de l'equip a tenir-les.

## Què s'ha fet

- Revisió de les tres col·leccions i dels seus conflictes amb el brief (vegeu [[0027-skills-de-disseny-de-tercers-subordinades-a-frutiger-cosmo]]).
- `references/skills-de-tercers.md` a `estetica-frutiger-cosmo`: què s'usa, què es prohibeix, taula de conflictes i detecció.
- `.agents/scripts/skills-de-tercers.mjs` (amb proves) i hook `SessionStart`: detecta què hi ha i, si falta, suggereix instal·lar-ho una sola vegada.
- «Porta per a moviment nou» a `so-i-moviment.md` i seccions noves a `checklist.md`.
- Punters curts a `frontend-component`, `frontend-pagina`, `frontend-jocs-dinamics`, `implementar-us` i als subagents `frontend` i `reviewer-arquitectura`; regla a `AGENTS.md`.
- Guia [[skills-de-disseny-de-tercers]] i entrades al `.gitignore`.

## Decisions

- Opcionals i a nivell d'usuari, mai copiades al repo; les instal·la la persona.
- El brief guanya sempre; Taste no dissenya, Impeccable no escriu `PRODUCT.md`/`DESIGN.md` i Emil no toca el que l'equip va decidir el 2026-10-13.

## Pendent

- [ ] Validar l'ADR-0027 (estat «proposada») amb l'equip a la revisió de la PR #52.
- [ ] Validar els valors marcats *(proposta a validar)*: equivalències de moviment, allow-list de Taste i plataforma d'Impeccable.
- [ ] Provar l'inspector de Taste sobre l'admin web (`--allow` no provat en aquest repo).
- [ ] Decidir si les pàgines públiques de TG-343 segueixen Frutiger Cosmo (recomanat).
