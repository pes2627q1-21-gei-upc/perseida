---
titol: "uv i pnpm com a gestors de dependències"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-31", "TG-32"]
font: "memòria §2.6, §2.5.6, §2.10.5; backend/README.md; frontend/README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, dependencies, uv, pnpm]
---

# ADR-0013 · uv i pnpm com a gestors de dependències

## Context

El monorepo conté un backend en Python i un frontend en TypeScript. La memòria §2.6 i §2.10.5 demanen que les dependències noves s'afegeixin amb la versió fixada.

## Decisió

Les dependències del backend (Python) es gestionen amb `uv` i les del frontend (TypeScript) amb `pnpm`. Les dependències noves s'afegeixen amb una d'aquestes eines i amb la versió fixada. En local s'executen els tests amb `uv run pytest` i `pnpm test`; la CI desa en memòria cau les dependències d'uv i pnpm per reduir el temps d'execució.

## Conseqüències

### Positives

- Un únic gestor per llenguatge, comú a tot l'equip i a la CI.
- La memòria cau de dependències a la CI en redueix el temps d'execució.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-31 (configuració del projecte backend Python amb gestor de dependències, linter i type checker)
- TG-32 (configuració del projecte frontend React Native + TypeScript amb ESLint, Prettier i Tailwind)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[backend-hexagonal]]
- [[frontend]]
- [[qualitat]]
- [[testing]]
- [[assistents-ia]]
