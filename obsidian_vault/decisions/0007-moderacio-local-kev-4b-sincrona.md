---
titol: "Moderació local amb Kev-4B i crida síncrona"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-81", "TG-101"]
font: "memòria §3.4.1, §2.5.3; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, moderacio, kev-4b, privacitat]
---

# ADR-0007 · Moderació local amb Kev-4B i crida síncrona

## Context

Abans de difondre qualsevol publicació o missatge de xat cal avaluar-ne el contingut (en castellà, català o anglès, amb el context previ de la conversa). (memòria §3.4.1; incepció 2 del 02-10-2026).

## Decisió

La moderació és un microservei independent dins del Docker Compose que executa localment el model Kev-4B, accessible només des de la xarxa interna de Docker. L'API el crida de manera síncrona dins del flux de publicació, de manera que cap contingut es difon abans que el model l'hagi avaluat. L'avaluació es fa en un únic pas endavant i té tres resultats: infracció greu (odi o contingut sexual), contingut eliminat i compte bandejat; fora de temàtica, contingut eliminat i avís preventiu; en qualsevol altre cas, es permet la difusió.

## Conseqüències

### Positives

- No es depèn d'un tercer.
- El contingut dels usuaris no surt del servidor.
- A la CI el servei se substitueix per un stub amb veredictes predefinits.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- API externa de moderació: descartada perquè obligaria a dependre d'un tercer i a enviar-hi contingut dels usuaris.

## US de Taiga relacionades

- TG-81 (moderació síncrona amb Kev-4B)
- TG-101 (microservei de moderació Kev-4B)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[moderation]]
- [[api]]
- [[arquitectura-fisica]]
- [[testing]]
- [[0003-un-sol-proces-fastapi]]
