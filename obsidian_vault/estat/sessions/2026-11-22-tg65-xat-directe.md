---
titol: "Sessió TG-65: persistència i API REST del xat directe"
tipus: sessio
estat: vigent
data: "2026-11-22"
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
- S'han registrat tests en vermell per a l'outbox i l'acceptació durable; encara no hi ha implementació integrada ni verificada.

## Decisions preses

- [[0034-outbox-xat-directe]] proposa la persistència atòmica del missatge i l'entrada de sortida, amb reintents i deduplicació; el limitador indisponible rebutja l'enviament i un bloqueig completat abans del despatx cancel·la la difusió, conservant l'historial.
- S'han acordat camps REST per obrir conversa, l'estructura de l'historial i el perfil de l'altre participant, canals WebSocket privats i un indicador d'escriptura efímer de cinc segons.

## Canvis al vault

- [[0034-outbox-xat-directe]]: decisió proposada, pendent d'implementar i revisar.

## Pendent / següents passos

- [ ] Completar outbox, proves de concurrència, difusor WebSocket privat i integració del worker.
- [ ] Connectar API i pantalles del frontend, bloqueig i indicador d'escriptura; verificar accessibilitat i traduccions.
- [ ] Verificar tots els criteris, cobertura i mutation amb Docker, E2E mòbil i checks; preparar i revisar la pila de PR i Taiga segons el pla aprovat.

## US de Taiga

- TG-65
