---
titol: "Sessió TG-65: integració del xat directe"
tipus: sessio
estat: vigent
data: "2026-11-23"
us: ["TG-65"]
font: "Implementació, CI i decisions de la persona responsable"
etiquetes: [sessio, xat, frontend, backend]
---

# Sessió 2026-11-23 · TG-65

## Objectiu

Integrar el xat directe sobre `develop`, verificar-ne els fluxos i preparar la pila de PR.

## Què s'ha fet

- S'han integrat persistència, outbox, API REST, WebSocket privat i pantalles amb bloqueig, historial, no llegits i indicador d'escriptura.
- S'han obert sis PR en borrador: servei, consultes, persistència, API i dues capes de frontend. Les cinc primeres tenen CI i Sonar en verd; la integració final resta en verificació.
- Una prova de navegador amb resolució mòbil, PostgreSQL i Redis locals i dues sessions sintètiques ha verificat obertura, indicador d'escriptura, enviament en directe i nom del remitent a l'historial.
- S'ha incorporat el `.mailmap` acordat per la persona responsable.

## Decisions preses

- [[0034-outbox-xat-directe]] documenta l'acceptació durable i els reintents, inclòs el tractament de bloquejos i el límit de Redis.
- L'indicador renova l'estat com a màxim cada quatre segons mentre hi ha activitat i envia la parada quan cessa.

## Canvis al vault

- [[0034-outbox-xat-directe]]: decisió proposada per a la revisió de la PR.
- [[api]] i [[model-de-domini]]: contracte i model del xat directe.

## Pendent / següents passos

- [ ] Revisar CI, cobertura, mutacions i Sonar de la PR d'integració al commit final.
- [ ] Revisar la pila i els criteris d'acceptació abans de passar les PR a punt per revisar; cap PR s'ha fusionat.
- [ ] Actualitzar Taiga segons el pla acordat quan la verificació sigui completa.

## US de Taiga

- TG-65
