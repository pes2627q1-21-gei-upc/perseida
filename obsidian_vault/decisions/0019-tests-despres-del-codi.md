---
titol: "Tests després del codi a totes les capes"
tipus: adr
estat: substituida
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisió de la persona responsable, acceptada per l'equip (TG-39)"
etiquetes: [adr, testing, tdd, backend]
---

# ADR-0019 · Tests després del codi a totes les capes

> [!warning] Substituïda
> Aquesta ADR la substitueix [[0028-tdd-estricte-i-politica-de-testing-avancada]] (2026-10-28, TG-353): des del final de l'Sprint 1 es fa TDD estricte a totes les capes, amb el commit `test:` en vermell abans del `feat:`. Es conserva com a registre històric.

## Context

[[0004-arquitectura-hexagonal-i-tdd-al-domini]] i [[testing]] exigeixen TDD estricte al domini (test en vermell en un commit propi). La persona responsable de TG-205 vol que les skills generin els tests **després** del codi a totes les capes.

## Decisió

Les skills i els subagents escriuen el codi primer i els tests immediatament després, dins la mateixa tasca i abans d'obrir la PR. Es mantenen la piràmide 70/30, els llindars de cobertura i la traçabilitat per US de [[testing]]. Si la persona demana TDD en una tasca concreta, l'agent el segueix.

## Conseqüències

### Positives

- Flux més àgil per als agents; una sola regla per a totes les capes.

### Negatives (assumides)

- Es perd el cicle red–green–refactor visible a l'historial al domini.
- Cal revisar que els tests no s'acomodin al codi (revisió humana de les PR).

## Alternatives descartades

- Mantenir TDD estricte al domini i tests després a la resta: era la proposta per defecte; la persona va triar tests després arreu.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)

## Enllaços

- [[0028-tdd-estricte-i-politica-de-testing-avancada]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[testing]]
- [[assistents-ia]]
