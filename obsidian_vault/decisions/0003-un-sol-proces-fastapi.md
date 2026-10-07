---
titol: "Un sol procés FastAPI (REST, WebSocket i planificador)"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-39", "TG-63", "TG-88"]
font: "memòria §3.4.1; incepció 2 §6 (02-10-2026); backend/README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, backend, fastapi, websocket, apscheduler]
---

# ADR-0003 · Un sol procés FastAPI (REST, WebSocket i planificador)

## Context

El backend ha d'atendre peticions REST de l'app mòbil i del panell d'administració, gestionar el xat en temps real per WebSocket i executar accions periòdiques (notificacions programades i neteja de contingut caducat). El disseny inicial era més distribuït, amb serveis separats per a workers, planificador i gateway de WebSocket (memòria §3.4.1; la incepció 2 del 02-10-2026 ja descriu el backend com un sol procés).

## Decisió

L'API s'executa en un únic contenidor FastAPI que integra tres responsabilitats en un sol procés: REST, WebSocket del xat (amb Redis pub/sub) i un planificador intern APScheduler, sense processos worker dedicats.

## Conseqüències

### Positives

- Redueix el nombre de peces mòbils del sistema i en facilita el desplegament i el manteniment.
- No calen cues de tasques ni processos en segon pla addicionals (vegeu [[0005-redis-nomes-com-a-cache-lazy]]).

### Negatives (assumides)

- Se sacrifica la capacitat d'escalar horitzontalment; limitació assumible dins de l'abast d'un projecte acadèmic com el PES, amb un volum d'usuaris concurrents molt reduït.

## Alternatives descartades

- Disseny inicial distribuït, amb serveis separats per a workers, planificador i gateway de WebSocket: simplificat per reduir les peces mòbils i facilitar desplegament i manteniment.

## US de Taiga relacionades

- TG-39 (esquelet FastAPI async amb capes domain/application/infrastructure)
- TG-63 (endpoint WebSocket integrat a l'API amb Redis pub/sub)
- TG-88 (planificador APScheduler)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[api]]
- [[backend-hexagonal]]
- [[arquitectura-fisica]]
- [[redis]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]
