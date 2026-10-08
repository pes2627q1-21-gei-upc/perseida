---
titol: "Arquitectura hexagonal i TDD a la capa de domini"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-39"]
font: "memòria §2.5.2; backend/README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, backend, hexagonal, tdd, testing]
---

# ADR-0004 · Arquitectura hexagonal i TDD a la capa de domini

> [!warning] Parcialment substituïda
> El TDD estricte al domini el substitueix [[0019-tests-despres-del-codi]]; els ports, que passen al domini, els concreta [[0016-ports-i-entitats-riques-al-domini]]. La resta d'aquesta ADR (arquitectura hexagonal en tres capes) continua vigent.

## Context

El backend concentra lògica de negoci crítica: càlcul de ràtxes consecutives de consulta diària, motor de fites desbloquejables, algorisme de puntuació i recomanació de zones d'observació, regles de decisió de la moderació i filtrat i ordenació d'esdeveniments (memòria §2.5.2). Aquesta lògica ha de ser provable de manera ràpida i aïllada.

## Decisió

El backend s'estructura en tres capes: `domain` (lògica de negoci sense dependència de frameworks, base de dades ni serveis externs), `application` (casos d'ús que orquestren el domini a través de ports) i `infrastructure` (adaptadors). A la capa de domini s'aplica TDD sistemàtic amb el cicle red–green–refactor; el test en vermell es puja en un commit propi abans del commit que el fa passar.

## Conseqüències

### Positives

- Les proves del domini són ràpides i aïllades, perquè la capa no depèn de cap framework, base de dades ni servei extern.
- El cicle TDD es pot seguir a l'historial de cada pull request.
- Els tests es deriven dels criteris d'acceptació i continuen definint el comportament esperat.

### Negatives (assumides)

- A les capes d'aplicació, infraestructura i interfície no s'aplica TDD estricte; només s'exigeix que les proves s'escriguin dins la mateixa tasca i abans d'obrir la PR.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-39 (esquelet FastAPI async amb capes domain/application/infrastructure)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[backend-hexagonal]]
- [[testing]]
- [[qualitat]]
- [[model-de-domini]]
- [[0003-un-sol-proces-fastapi]]
