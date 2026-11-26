---
titol: "Sessió TG-65: persistència i API REST del xat directe"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-65"]
font: "Treball local i decisions de la persona responsable el 2026-11-22"
etiquetes: [sessio, xat, backend]
---

# Sessió 2026-11-22 · TG-65

## Objectiu

Continuar el xat directe preservant els worktrees i els commits existents.

## Què s'ha fet

- S'han completat els repositoris i la migració a la branca de persistència: 56 proves d'integració, Ruff i mypy passen.
- S'ha avançat la branca de l'API amb aquesta persistència. Les rutes REST i la consulta de perfils estan implementades; 25 proves REST i 93 proves de perfil i regressió passen. Ruff i mypy passen en els fitxers comprovats.
- L'outbox, el despachador, el difusor WebSocket privat i el handler de `dm.send`/`dm.typing` estan implementats a la branca de l'API (PR 151).
- Revisió de la PR 151 (2026-11-26): el cursor del despachador es reinicia en acabar la cua (regressió amb un missatge nou darrere d'un d'encallat); l'autorització de `dm.typing` passa a `DirectChatService.typing_recipient`; tests WebSocket de `dm.send` per a `VALIDATION_ERROR`, `RATE_LIMITED` i `USER_BLOCKED`.
- Les proves d'integració contra PostgreSQL i Redis no s'han pogut executar en aquesta sessió (sense Docker); queden per a la CI.

## Decisions preses

- [[0034-outbox-xat-directe]] proposa la persistència atòmica del missatge i l'entrada de sortida, amb reintents i deduplicació; el limitador indisponible rebutja l'enviament i un bloqueig completat abans del despatx cancel·la la difusió, conservant l'historial.
- S'han acordat camps REST per obrir conversa, l'estructura de l'historial i el perfil de l'altre participant, canals WebSocket privats i un indicador d'escriptura efímer de cinc segons.

## Canvis al vault

- [[0034-outbox-xat-directe]]: decisió acceptada; `dm.typing` registrat com a abast de TG-65 acceptat pel PO i confirmat el 26/11/2026.
- [[0030-protocol-websocket-i-revocacio-per-pub-sub]], [[redis]], [[postgres]], [[chat]], [[api]] i [[model-de-domini]] posats al dia.

## Pendent / següents passos

- [ ] Connectar API i pantalles del frontend, bloqueig i indicador d'escriptura; verificar accessibilitat i traduccions.
- [ ] Verificar tots els criteris, cobertura i mutation amb Docker, E2E mòbil i checks; preparar i revisar la pila de PR i Taiga segons el pla aprovat.

## US de Taiga

- TG-65
