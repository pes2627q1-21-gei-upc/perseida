---
titol: "Sessió 2026-11-22: consultes, historial, lectura i bloqueig del xat directe (TG-65, capa 2)"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-65", "TG-403", "TG-404"]
font: "Taiga: US #65, tasques #403 i #404"
etiquetes: [sessio, backend, xat, servei]
---

# Sessió 2026-11-22 · Consultes i bloqueig del xat directe (capa 2 de TG-65)

## Objectiu

Fer passar en verd els tests de consultes de `DirectChatService` (commit `test:` previ, ADR-0028) sense tocar-los.

## Què s'ha fet

- **Domini:** `ConversationSummary` i els ports `summaries_of` i `blocked_among`.
- **Aplicació:** `list_conversations`, `get_history`, `mark_read`, `block_user` i `unblock_user`, amb els models `ConversationOverview` i `DirectHistoryPage` (detall a [[model-de-domini]], secció «Xat directe»). El constructor accepta un `now` opcional.
- **Fakes:** només s'ha pujat l'import de `ConversationSummary` (commit `refactor:` a part).
- **Verificació:** `ruff`, `mypy`, `lint-imports`, tests unitaris i d'arquitectura en verd (només falla `test_pr_base.py` per l'absència de `git` al contenidor); mutation del domini 80,22 %.

## Pendent

- [ ] Capes següents: adaptadors SQLModel (`summaries_of` i `blocked_among` en una sola consulta), API i frontend.

## US de Taiga

- TG-65 (tasques TG-403 i TG-404)
