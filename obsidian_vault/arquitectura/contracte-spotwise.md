---
titol: "Contracte de serveis amb Spotwise"
tipus: arquitectura
estat: vigent
data: "2026-11-17"
us: ["TG-85", "TG-50", "TG-351", "TG-643"]
font: "README.md (arrel), backend/README.md, incepció 2 §8; Taiga TG-50, tasca #387 (31/10/2026); ADR-0031 (10/11/2026); TG-351, tasca #477 (10/11/2026); documents de Spotwise «Respostes de Spotwise sobre el servei d'esdeveniments» i «Servei d'espais de Spotwise per a Perseida» (novembre de 2026)"
etiquetes: [arquitectura, integracions, spotwise, contracte]
---

# Contracte de serveis amb Spotwise (grup 21B)

Perseida i Spotwise (aplicació de recomanació d'espais, grup 21B) s'integren en les dues direccions. El contracte s'ha d'acordar a l'Sprint 1 (definició de contractes, segons la memòria); el README d'arrel afirma que ja es va acordar a l'Sprint 1, cosa que no s'ha verificat en altres fonts.

## Servei proveït per Perseida

- `GET /api/events/active` i `GET /api/events/upcoming`: esdeveniments astronòmics rellevants actius en una data concreta o durant els dies vinents (pluges d'estrelles, eclipsis, superlluna, llançaments espacials).
- El JSON inclou metadades clau de cada fenomen: **títol**, **descripció breu** i **categoria** (p. ex. `lunar`, `solar`, `meteor_shower`). El format exacte de cada esdeveniment és a [[contracte-esdeveniments]] (TG-50, tasca #387).
- **Límit de peticions:** els endpoints són públics i el proxy admet 600 peticions per minut (ràfega de 100), compartides per tots els clients perquè el NAT de la UPC amaga la IP d'origen (TG-643). Per sobre, respon `429` en problem+json amb `code: RATE_LIMITED` i `Retry-After` ([[nginx-proxy-manager]], TG-351). Spotwise ens crida des del seu backend (unes 2 peticions per hora), i aquestes peticions comparteixen el comptador amb les de l'app: no tenen un límit reservat. L'OpenAPI dels dos endpoints documenta aquest 429.
- Ús per a Spotwise: personalitzar la seva interfície segons el context astronòmic (temes visuals, petites notificacions o pop-ups mentre cerquen locals).
- Les dades provenen de la base de dades de Perseida, que s'omple sota demanda amb Launch Library 2 (llançaments), l'USNO (eclipsis solars), Skyfield (lluna) i un catàleg de pluges d'estels de la IMO ([[0031-fonts-d-esdeveniments-sota-demanda]], [[serveis-externs]]). L'endpoint el serveix l'[[api]].

### Respostes de Spotwise (novembre de 2026)

Spotwise accepta el format tal com està a [[contracte-esdeveniments]] i no demana cap camp més.

- **Origen:** ens criden sempre des del seu backend, és a dir des d'una sola IP. El límit de 60 peticions per minut els anava bé. Ara és de 600 per minut, però compartit amb tots els clients de l'app, no per a ells sols (TG-643).
- **Freqüència:** una tasca periòdica del seu backend consulta cada hora `/api/events/active` i `/api/events/upcoming?days=7` i en desa el resultat. Són unes 2 peticions per hora (unes 50 al dia). La seva app llegeix del seu backend, mai del nostre.
- **Ús:** les categories `lunar` i `solar` canvien la temàtica visual de la seva app, i totes les categories serveixen per avisar dels esdeveniments propers. Accepten `location` i `launch`, tot i que de moment no fan servir la ubicació.
- **Idioma:** l'anglès els serveix. Ells tradueixen la `category` al català, al castellà i a l'anglès, i mostren el `title` tal com arriba.
- **CORS:** no en necessiten, perquè ens criden des del backend.
- **Calendari:** l'integren a l'Sprint 3 (del 30/11 al 18/12/2026) i, mentrestant, treballen amb els nostres exemples. Volen el servei desplegat a principis de l'Sprint 3: cal avisar-los de la data.
- **Eclipsis:** van preguntar si un eclipsi de lluna arriba amb la categoria `lunar`. Sí: un eclipsi de lluna és `lunar` i un de sol és `solar` (vegeu [[contracte-esdeveniments#Camps]]).

## Servei consumit per Perseida

- La cerca i filtratge d'espais de Spotwise (biblioteques i cafeteries de Barcelona), basada en el «perfil de sessió»: ubicació, nivell de silenci, idoneïtat per a grups, Wi-Fi públic o endolls.
- Ús a Perseida: suggerir punts de trobada en organitzar esdeveniments astronòmics (cafeteries aptes per a «watch parties», biblioteques per a reunions d'estudi o preparació de sortides d'observació).

Detall del servei segons el document de Spotwise (novembre de 2026). Ja està desplegat: és el mateix endpoint que fa servir la seva app. Ara hi surten les biblioteques i les sales d'estudi municipals de Barcelona; les cafeteries encara no hi són, però tindran el mateix format.

### Endpoint i accés

| Element | Valor |
|---|---|
| URL base | `http://nattech.fib.upc.edu:40420` (HTTP, no HTTPS) |
| Cerca d'espais | `GET /api/espais/` |
| Detall d'un espai | `GET /api/espais/<id>/` (descripció i horari; no hi ha fitxa web) |
| Autenticació | Capçalera `Authorization: Token <token>` |
| OpenAPI | `/api/docs/` (pública, sense token) |
| Estat | `/api/health/` (públic), retorna `{"status": "ok", "database": true}` |

> [!warning] Token
> Spotwise ens crea un usuari propi i ens passa el token per privat. El token no caduca; si el canvien, ens avisaran. **No va mai al repo ni al vault**: es configura com a secret de l'entorn ([[seguretat]]).

No tenen entorn de proves: es pot provar contra aquest servidor, perquè l'endpoint només llegeix dades.

### Paràmetres

Tots són opcionals. Sense cap paràmetre, retorna tots els espais.

| Paràmetre | Valors | Regla |
|---|---|---|
| `lat`, `lon` | `lat` −90..90, `lon` −180..180 | S'envien junts. Cada espai porta la distància i l'ordre té en compte la proximitat |
| `silenci` | `silencios`, `murmuri`, `sorollos` | Es pot repetir: `?silenci=silencios&silenci=murmuri` |
| `endolls` | `molts`, `pocs`, `cap` | Es pot repetir, com `silenci` |
| `grup` | `true`, `false` | Si l'espai és apte per treballar en grup |
| `data`, `inici`, `fi` | `AAAA-MM-DD`, `HH:MM`, `HH:MM` (hora local de Barcelona) | S'envien els tres junts i `fi` ha de ser després d'`inici`. Només surten els espais oberts tota la franja |

No hi ha paràmetre de radi ni de wifi: es filtra a Perseida amb `distancia_m` (p. ex. menys de 1.500 m) i `te_wifi = true`. Si es filtra per `silenci`, `endolls` o `grup`, els espais sense cap vot d'aquell atribut també surten, al final i amb el valor a `null`; per quedar-se només amb els confirmats, cal descartar els `null`.

Perfils proposats per Spotwise:

| Perfil | Crida | Filtre a Perseida |
|---|---|---|
| Watch party | `GET /api/espais/?lat=…&lon=…&grup=true` (opcionalment amb `data`, `inici` i `fi` de l'esdeveniment) | `te_wifi = true` i, si cal, distància màxima |
| Estudi | `GET /api/espais/?lat=…&lon=…&silenci=silencios&endolls=molts&endolls=pocs` | Distància màxima, si cal |

### Resposta

`200` amb un array JSON d'espais, sense paginació. Tots els camps hi són sempre; si no tenen valor, valen `null`.

| Camp | Tipus | `null` | Contingut |
|---|---|---|---|
| `id` | enter | no | Identificador estable |
| `nom` | text | no | Nom de l'espai |
| `tipus` / `tipus_display` | text | no | `biblioteca`, `cafeteria` o `altre` / text per mostrar |
| `adreca` | text | no (pot ser `""`) | Adreça |
| `latitud`, `longitud` | nombre | no | Ubicació |
| `te_wifi` | booleà | no | Biblioteca o punt wifi municipal a menys de 50 m |
| `nivell_silenci` | text | sí | `silencios`, `murmuri` o `sorollos` (el més votat) |
| `endolls_disponibles` | text | sí | `molts`, `pocs` o `cap` (el més votat; no és un booleà) |
| `apte_grup` | booleà | sí | El més votat |
| `vots_silenci`, `vots_endolls`, `vots_grup` | enter | no | Vots de cada atribut (0 si ningú) |
| `valoracio_mitjana` | nombre | sí | De 1 a 5, amb un decimal |
| `num_valoracions` | enter | no | Nombre de valoracions |
| `incomplet` | booleà | no | `true` si falta alguna dada |
| `dades_que_falten` | llista de text | no (pot ser `[]`) | `horari`, `silenci`, `endolls`, `grup` |
| `distancia_m` | enter | sí | Metres; `null` sense `lat` i `lon` |
| `obert_ara` | booleà | sí | `null` si no se'n sap l'horari |

**Ordre:** amb `lat` i `lon`, per una puntuació que combina proximitat (60 %, fins a 2 km) i valoració (40 %), i després per distància. Sense ubicació, només per valoració. Els espais sense la dada d'algun filtre van al final. Sense resultats, `200` amb `[]`.

Els exemples de resposta del document de Spotwise (amb resultats, sense resultats i errors) tenen el format exacte del servidor i serveixen per al mock de la US que integri el servei.

### Errors, límits i disponibilitat

| Codi | Quan | Cos |
|---|---|---|
| `400` | Paràmetre invàlid | JSON amb el nom del paràmetre (o `non_field_errors`) i una llista de missatges en català, p. ex. `{"silenci": ["«alt» no és un valor vàlid."]}` |
| `401` | Falta el token o no és vàlid | `{"detail": "..."}` |
| `5xx` | Error o servidor aturat | Pot arribar sense JSON: es tracta com a servei no disponible |

- **Límit:** l'endpoint no en té, però demanen no passar de 60 peticions per minut i desar les respostes en cache uns minuts, perquè les dades canvien poc durant el dia ([[0005-redis-nomes-com-a-cache-lazy]]).
- **Temps d'espera:** recomanen 5 segons; si se supera, es mostra el missatge d'indisponibilitat.

## Regla de canvis

> [!warning] Sprints 2-3
> Qualsevol canvi del contracte durant els Sprints 2 i 3 s'ha de **notificar i justificar**, perquè afecta els dos equips.

## Enllaços

- [[visio-general]], [[serveis-externs]], [[api]]
- [[epiques-i-us]]
