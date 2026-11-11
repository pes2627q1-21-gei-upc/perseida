---
titol: "ADR-0031: Fonts d'esdeveniments astronòmics sota demanda"
tipus: adr
estat: proposada
data: "2026-11-10"
us: ["TG-50", "TG-351", "TG-64"]
font: "US TG-50 i tasca #501 de Taiga; spike del 10/11/2026 (crides a ll.thespacedevs.com 2.3.0, aa.usno.navy.mil/api/eclipses/solar i /api/moon/phases, i PyPI de skyfield 1.55); decisions de Manel (SM) del 10/11/2026; backend/app/infrastructure/events/; calendaris de la IMO de 2026 i 2027 (taula 5)"
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
| `skyfield` | `lunar` | Càlcul local amb Skyfield (llunes plenes i noves, i eclipsis de lluna) i un retall de les efemèrides DE421 dins del repositori | 24 h |
| `catalog` | `meteor_shower` | Catàleg versionat al repositori, copiat dels calendaris de la IMO | 24 h |

- **Sota demanda:** abans de cada consulta, `EventService` mira la marca `cache:events:<source>` de cada font a [[redis]]. Si no hi és, crida la font, fa l'upsert a [[postgres]] i posa la marca amb el TTL de la font.
- **Id estable:** l'upsert va per `(source, external_id)` i conserva l'`id` (UUIDv7) i `created_at`. Un llançament reprogramat actualitza les dades del mateix esdeveniment.
- **Font caiguda:** timeout, error HTTP o JSON inservible fan que la font llanci `ExternalServiceError`. El servei ho registra (amb el correlation id), posa la marca durant 15 min perquè no es torni a cridar i respon amb el que hi ha a PostgreSQL. Una font que falla no atura les altres i no provoca mai un 5xx.
- **Registres incomplets:** es descarten d'un en un i es registren al log, sense fer fallar la resta. També els que PostgreSQL rebutjaria i farien fallar tot el lot: textos amb el caràcter NUL o un `external_id` de més de 255 caràcters (`EventDraft` no els accepta), i els elements de la resposta que no són un objecte. A Launch Library 2, un llançament sense `mission.description`, sense `window_start` o `window_end`, o que acaba abans de començar, es descarta. `starts_at` i `ends_at` són la finestra de llançament; la ubicació és la de la plataforma; `source_url` és l'URL del llançament a l'API (només si és `https`).
- **Quota de Launch Library 2:** a més de la marca d'1 h, l'adaptador (una sola instància per procés, [[0003-un-sol-proces-fastapi]]) no fa mai més d'una crida per hora, encara que Redis estigui caigut o arribin peticions concurrents. Una crida fallida també compta. Si l'han cridat fa menys d'una hora, torna els llançaments de l'última crida i no és una fallada. Així una consulta que arriba mentre una altra els desa també els desa abans de respondre, i un desament fallit es reintenta.
- **Eclipsis solars:** l'API de l'USNO només dona la data. L'eclipsi ocupa tot el dia UTC (de 00:00 a 23:59:59) i no té ubicació (`location` és `null`). Es consulten l'any en curs i el següent.
- **Lluna:** llunes plenes i noves i eclipsis de lluna (penombrals, parcials i totals) de l'any en curs i del següent. Són instantanis (`ends_at` = `starts_at`, al segon) i sense ubicació. Les efemèrides són un retall de DE421 (Sol, Terra, Lluna i els baricentres de Júpiter i Saturn, de desembre de 2025 a gener de 2031; uns 400 KB) a `backend/app/infrastructure/events/data/`, generat amb `python -m jplephem excerpt`. No es descarrega res: ni en construir la imatge ni en executar. A partir del 2030 cal regenerar-lo; fins llavors, fora de rang la font falla com una font caiguda.
- **Pluges d'estels:** les 9 principals de cada any (Quadràntides, Lírides d'abril, Eta Aquàrides, Delta Aquàrides del sud, Perseides, Oriònides, Leònides, Gemínides i Úrsides), copiades de la taula 5 dels calendaris de la IMO de 2026 i 2027. Cada pluja ocupa tot el seu període d'activitat; el `summary` en dona el màxim i la taxa (ZHR). Afegir un any vol dir copiar-ne el calendari.
- **Idioma:** els textos arriben en l'idioma de la font (anglès) i els calculats es generen en anglès (vegeu [[contracte-esdeveniments]]).

## Conseqüències

### Positives

- Sense planificador ni clau d'API; cada font es pot substituir sense tocar el servei.
- PostgreSQL és la font de veritat: amb una font o Redis caiguts, l'API continua responent amb les dades desades.
- La quota de Launch Library 2 queda garantida dins el procés.

### Negatives (assumides)

- La primera consulta després que caduqui una marca espera la crida a la font (timeout de 3 s de connexió i de 10 s per operació de lectura o escriptura, no en total).
- Un error de PostgreSQL en desar el que retorna una font fa fallar la consulta, igual que la lectura posterior; no s'aïlla com una font caiguda.
- Skyfield afegeix dependències (`numpy`, `jplephem`, `sgp4`), sense tipus (excepció a mypy).
- El retall de les efemèrides i el catàleg s'han d'actualitzar a mà quan s'acabin (2030 i 2027).
- Una pluja d'estels apareix com a «activa» durant setmanes, encara que només es vegi bé prop del màxim.
- Els eclipsis solars no tenen hora ni ubicació.
- Amb més d'un procés, la quota de Launch Library 2 es comptaria per procés (avui n'hi ha un, ADR-0003).

## Alternatives descartades

- **Planificador que precarregui les fonts:** contradiu el patró sota demanda d'[[0005-redis-nomes-com-a-cache-lazy]] i crida les fonts encara que ningú consulti.
- **Fases de la lluna de l'USNO en lloc de Skyfield:** evita la dependència, però l'USNO no té API d'eclipsis de lluna.
- **Descarregar les efemèrides en temps d'execució:** la imatge seria més lleugera, però l'API dependria de la xarxa en arrencar.
- **DE421 sencer (16,8 MB) baixat al Dockerfile:** el build dependria de ssd.jpl.nasa.gov i els tests necessitarien una altra còpia; el retall cobreix de sobres la vida del projecte.
- **Totes les pluges de la IMO (unes 40):** la majoria tenen 2-5 meteors per hora i no es poden observar.
- **Només la nit del màxim de cada pluja:** més precís com a avís, però amaga que la pluja és activa durant setmanes.
- **Calcular amb Skyfield o consultar el detall de l'USNO per als eclipsis solars:** més precís, però amb molt més codi o més crides per a un benefici que cap criteri demana.

## US de Taiga relacionades

- TG-50 (fonts, cache i upsert), TG-351 (endpoints que les consulten), TG-64 (fa servir `exists` per a la FK de la sala)

## Enllaços

- [[contracte-esdeveniments]], [[model-de-domini]], [[serveis-externs]], [[redis]], [[postgres]]
- [Launch Library 2](https://ll.thespacedevs.com/docs/), [API de l'USNO](https://aa.usno.navy.mil/data/api), [Skyfield](https://rhodesmill.org/skyfield/), [calendari IMO 2026](https://www.imo.net/files/meteor-shower/cal2026.pdf) i [2027](https://www.imo.net/files/meteor-shower/cal2027.pdf)
