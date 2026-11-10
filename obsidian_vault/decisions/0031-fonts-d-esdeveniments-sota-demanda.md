---
titol: "ADR-0031: Fonts d'esdeveniments astronòmics sota demanda"
tipus: adr
estat: proposada
data: "2026-11-10"
us: ["TG-50", "TG-351", "TG-64"]
font: "US TG-50 i tasca #501 de Taiga; spike del 10/11/2026 (crides a ll.thespacedevs.com 2.3.0, aa.usno.navy.mil/api/eclipses/solar i /api/moon/phases, i PyPI de skyfield 1.55); decisions de Manel (SM) del 10/11/2026; backend/app/infrastructure/events/"
etiquetes: [adr, backend, esdeveniments, serveis-externs, redis, cache]
---

# ADR-0031 · Fonts d'esdeveniments astronòmics sota demanda

## Context

TG-50 ha d'omplir la taula `astronomical_events` ([[model-de-domini#Esdeveniment astronòmic (implementat)]]) amb les quatre categories del [[contracte-esdeveniments]] (`launch`, `solar`, `lunar` i `meteor_shower`), sense planificador: les dades s'obtenen quan algú les consulta ([[0005-redis-nomes-com-a-cache-lazy]]). Cap font gratuïta no cobreix les quatre categories. Una font caiguda no pot fer fallar l'API, i Launch Library 2 només permet 15 crides per hora sense clau.

## Decisió

Cada categoria té la seva font, darrere del port `EventSource` (nom, TTL i `fetch()`):

| `source` | Categoria | Font | Frescor (TTL) |
|---|---|---|---|
| `launch_library_2` | `launch` | API de Launch Library 2 (The Space Devs), `GET /2.3.0/launches/upcoming/?limit=100&mode=normal`, sense clau | 1 h |
| `usno` | `solar` | API de l'USNO, `GET /api/eclipses/solar/year` | 24 h |
| `skyfield` | `lunar` | Càlcul local amb Skyfield (llunes plenes i noves, i eclipsis de lluna) i les efemèrides `de421.bsp` dins la imatge Docker | 24 h |
| `catalog` | `meteor_shower` | Catàleg versionat al repositori | 24 h |

- **Sota demanda:** abans de cada consulta, `EventService` mira la marca `cache:events:<source>` de cada font a [[redis]]. Si no hi és, crida la font, fa l'upsert a [[postgres]] i posa la marca amb el TTL de la font.
- **Id estable:** l'upsert va per `(source, external_id)` i conserva l'`id` (UUIDv7) i `created_at`. Un llançament reprogramat actualitza les dades del mateix esdeveniment.
- **Font caiguda:** timeout, error HTTP o JSON inservible fan que la font llanci `ExternalServiceError`. El servei ho registra (amb el correlation id), posa la marca durant 15 min perquè no es torni a cridar i respon amb el que hi ha a PostgreSQL. Una font que falla no atura les altres i no provoca mai un 5xx.
- **Registres incomplets:** es descarten d'un en un i es registren al log, sense fer fallar la resta. A Launch Library 2, un llançament sense `mission.description`, sense `window_start` o `window_end`, o que acaba abans de començar, es descarta. `starts_at` i `ends_at` són la finestra de llançament; la ubicació és la de la plataforma; `source_url` és l'URL del llançament a l'API (només si és `https`).
- **Quota de Launch Library 2:** a més de la marca d'1 h, l'adaptador (una sola instància per procés, [[0003-un-sol-proces-fastapi]]) no fa mai més d'una crida per hora, encara que Redis estigui caigut. Una crida fallida també compta.
- **Eclipsis solars:** l'API de l'USNO només dona la data. L'eclipsi ocupa tot el dia UTC (de 00:00 a 23:59:59) i no té ubicació (`location` és `null`).
- **Idioma:** els textos arriben en l'idioma de la font (anglès) i els calculats es generen en anglès (vegeu [[contracte-esdeveniments]]).

## Conseqüències

### Positives

- Sense planificador ni clau d'API; cada font es pot substituir sense tocar el servei.
- PostgreSQL és la font de veritat: amb una font o Redis caiguts, l'API continua responent amb les dades desades.
- La quota de Launch Library 2 queda garantida dins el procés.

### Negatives (assumides)

- La primera consulta després que caduqui una marca espera la crida a la font (timeout de 3 s de connexió i 10 s en total).
- Skyfield afegeix dependències (`numpy`, `jplephem`, `sgp4`) i uns 17 MB d'efemèrides a la imatge.
- Els eclipsis solars no tenen hora ni ubicació.
- Amb més d'un procés, la quota de Launch Library 2 es comptaria per procés (avui n'hi ha un, ADR-0003).

## Alternatives descartades

- **Planificador que precarregui les fonts:** contradiu el patró sota demanda d'[[0005-redis-nomes-com-a-cache-lazy]] i crida les fonts encara que ningú consulti.
- **Fases de la lluna de l'USNO en lloc de Skyfield:** evita la dependència, però l'USNO no té API d'eclipsis de lluna.
- **Descarregar les efemèrides en temps d'execució:** la imatge seria més lleugera, però l'API dependria de la xarxa en arrencar.
- **Calcular amb Skyfield o consultar el detall de l'USNO per als eclipsis solars:** més precís, però amb molt més codi o més crides per a un benefici que cap criteri demana.

## US de Taiga relacionades

- TG-50 (fonts, cache i upsert), TG-351 (endpoints que les consulten), TG-64 (fa servir `exists` per a la FK de la sala)

## Enllaços

- [[contracte-esdeveniments]], [[model-de-domini]], [[serveis-externs]], [[redis]], [[postgres]]
- [Launch Library 2](https://ll.thespacedevs.com/docs/), [API de l'USNO](https://aa.usno.navy.mil/data/api), [Skyfield](https://rhodesmill.org/skyfield/)
