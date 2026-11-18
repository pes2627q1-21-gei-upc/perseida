---
titol: "Sessió 2026-11-18: persistència del xat d'esdeveniment (TG-448 i TG-450)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-64", "TG-448", "TG-450", "TG-53"]
font: "Taiga TG-64 (tasques #448 i #450, comentaris de la US i de les tasques); PR #105 de GitHub (TG-53); revisió d'arquitectura i decisions de l'autor en aquesta sessió"
etiquetes: [sessio, backend, xat, persistencia]
---

# Sessió 2026-11-18 · Persistència del xat (TG-448 i TG-450)

## Objectiu

Implementar la persistència de la sala i dels missatges del xat d'esdeveniment (US #64): tests d'integració en vermell (#448) i migració, taules i `SqlChatRepository` en verd (#450). Fora d'abast: router, WebSocket i frontend.

## Què s'ha fet

- **Desbloqueig a Taiga:** #450, #455 i #459 deixen de ser bloquejades, perquè les tasques de TG-53 que les bloquejaven (#558 i #559) són tancades i fusionades a `develop` (PR #105).
- **Branca:** `feature/TG-448-TG-450-repositori-xat`, amb `develop` integrat abans del push.
- **TDD estricte:** els tests en vermell (`test:`) van abans de cada canvi de codi.
  - `test:` de la integració del repositori i de la migració (TG-448).
  - `feat:` de la migració, les taules i el repositori (TG-450).
  - Després de la revisió d'arquitectura: `test:` en vermell dels errors de base de dades, del límit i del `CHECK` del text, i `fix:` que els posa en verd.
- **Model i adaptador:** detall a [[model-de-domini#Persistència del xat]] i a [[postgres]].
- **Verificació local amb PostgreSQL i Redis reals** (contenidors desechables):
  - ruff, mypy i import-linter (7 contractes) en verd;
  - 1643 tests i cobertura global del 99 %; `repository.py`, `tables.py` i els errors nous, al 100 %.

## Decisions

Cap ADR nova. Decisions de l'autor:

- `list_rooms_of` retorna només les sales que existeixen, per l'últim missatge descendent; les sales sense missatges, al final.
- FK amb `ON DELETE CASCADE` a l'esdeveniment, a la sala i a l'autor (com `event_subscriptions`); esborrar un usuari esborra els seus missatges.
- `page` demana `limit + 1` files per calcular el cursor següent.
- Errors de base de dades: tots els mètodes del repositori els tradueixen a `ExternalServiceError(DATABASE_UNAVAILABLE)`. Després de la review de la PR #109, el codi viu a `application/shared/error_codes.py` i és el patró dels repositoris ([[0018-errors-rfc-9457-amb-codis-estables|ADR-0018]], «Actualització (TG-64)»).
- Review PR #109: `add_message` només tradueix la FK de la sala a `CHAT_ROOM_NOT_FOUND`; `sent_at` té `server_default now()` (ADR-0023); codis al catàleg de `gestio-errors`.
- El `CHECK` del text només exigeix `length(text) >= 1`; el màxim de 1000 el dona el tipus `varchar(1000)`.
- `page` rebutja `limit < 1` al repositori, a més de la validació del servei.

## Pendent / següents passos

- [ ] Textos ca/es/en de `DATABASE_UNAVAILABLE` i `CHAT_ROOM_NOT_FOUND` (al catàleg com a «(pendent)»): s'han de decidir a TG-455, quan el router els exposi.
- [ ] Adoptar `DATABASE_UNAVAILABLE` a la resta de repositoris (esdeveniments, subscripcions, sortides, publicacions, usuaris, APOD): vegeu el deute a l'ADR-0018.
- [ ] Guardar un `EXPLAIN` de `list_rooms_of` si l'equip ho vol a la PR.
- [ ] TG-455 (router REST), TG-453 (tests de l'API), TG-457 i TG-459 (WebSocket), que reutilitzen aquest repositori.
- [ ] Reintents i duplicats de la publicació a Redis: TG-459.
- [ ] Nota o ADR del flux d'un missatge i `model-de-domini`, `api` i `redis` complets (criteri 19): TG-470.
- [ ] Subtasques #448 i #450 a «Ready for test» amb l'esforç real a Taiga.

## US de Taiga

- TG-64 (tasques #448 i #450)
- TG-53 (desbloqueig, PR #105)
