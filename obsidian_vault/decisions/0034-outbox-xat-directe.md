---
titol: "Outbox transaccional per al xat directe"
tipus: adr
estat: proposada
data: "2026-11-22"
us: ["TG-65"]
font: "TG-65 i decisions de la persona responsable durant la sessió del 2026-11-22"
etiquetes: [adr, xat, postgres, redis, outbox]
---

# ADR-0034 · Outbox transaccional per al xat directe

## Context

PostgreSQL i Redis Pub/Sub no comparteixen una transacció. No es pot garantir que el missatge es desi si i només si es publica quan hi ha caigudes o temps d'espera amb resultat desconegut. El criteri 14 de TG-65 exigia aquesta garantia; la persona responsable ha triat explícitament el compromís següent.

## Decisió

Desar el missatge i una entrada de sortida en una mateixa transacció PostgreSQL. Un despachador recupera i reintenta les entrades pendents. L'acceptació confirma persistència, no entrega; la publicació pot repetir-se i el client ha de deduplicar pel identificador estable del missatge. Si Redis no està disponible en comprovar el límit de freqüència, l'enviament es rebutja abans de desar-lo. Si un bloqueig es completa abans del despatx, la difusió pendent es cancel·la i l'historial es conserva.

## Conseqüències

### Positives

- Una fallada de publicació posterior a l'acceptació deixa una entrada recuperable.
- Missatge i entrada de sortida es confirmen o es desfan conjuntament.

### Negatives (assumides)

- Durant una caiguda posterior al control del límit, el missatge pot quedar desat sense haver-se difós, a diferència del text literal del criteri 14.
- La publicació és com a mínim una vegada, no exactament una; Pub/Sub tampoc garanteix l'entrega a clients desconnectats, que recuperen l'historial.
- Cal coordinar el bloqueig amb el despatx i mantenir actiu el mecanisme de reintents.

## Alternatives descartades

- Publicar abans o després de desar sense outbox: una caiguda entre operacions pot deixar-les inconsistents sense recuperació durable.
- Exigir atomicitat entre PostgreSQL i Redis Pub/Sub: no està disponible amb les interfícies actuals.

## US de Taiga relacionades

- TG-65

## Enllaços

- [[0030-protocol-websocket-i-revocacio-per-pub-sub]]
- [[0033-xat-per-esdeveniment-sala-missatge-i-flux]]
- [[postgres]] i [[redis]]
