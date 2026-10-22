---
titol: "Serveis externs"
tipus: arquitectura
estat: vigent
data: "2026-10-22"
us: ["TG-85", "TG-44", "TG-46"]
font: "README.md (arrel), backend/README.md, incepció 1 (NASA Open APIs), incepció 2 §6 i §3, memòria §3.4.1; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-46 i codi de backend/app/infrastructure/apod/ (2026-10-22)"
etiquetes: [arquitectura, integracions, nasa, google, fcm]
---

# Serveis externs

Serveis de tercers que Perseida no reimplementa. L'API els consulta des del backend, llevat de Google Identity (el client mòbil fa el flux OAuth2).

| Servei | Ús | Qui hi accedeix |
|---|---|---|
| NASA Open APIs | APOD (imatge astronòmica del dia), NeoWs (objectes propers a la Terra) | API |
| Meteorologia i contaminació lumínica | Dades per a la recomanació de zones d'observació (juntament amb PostGIS) | API |
| Google Identity | Inici de sessió: OAuth2 + PKCE; validació de tokens via JWKS | App (OAuth2 + PKCE), API (JWKS) |
| Firebase Cloud Messaging (FCM) | Notificacions push | API |

## NASA

La incepció 1 cita, entre les NASA Open APIs, APOD, NeoWs, Mars Rover Photos i DONKI (activitat solar i meteorologia espacial). La incepció 2 esmenta també la consulta a NASA/CNEOS sota demanda i amb cache (trajectòria i risc d'asteroides propers, dins un bloc marcat «MAYBE») i una galeria d'imatges dels rovers de Mart (NASA Open APIs). Els README concreten només APOD i NeoWs.

Patró d'accés: primera petició a l'API externa, resultat a Redis, i les següents des de cache; si l'API externa cau, es serveixen dades en cache ([[backend-hexagonal]], [[0005-redis-nomes-com-a-cache-lazy]]). Les respostes enregistrades es fan servir com a fixtures de test.

### APOD (implementat a TG-46)

- **Endpoint extern:** `GET https://api.nasa.gov/planetary/apod`, amb `date` opcional (sense data, l'últim APOD publicat).
- **Clau:** `NASA_API_KEY` (`SecretStr`), enviada a la capçalera `X-Api-Key` i no a la URL, perquè httpx registra les URL als logs. En local val `DEMO_KEY`; en producció ve del secret de GitHub `NASA_API_KEY`.
- **Client:** `NasaApodClient` (`app/infrastructure/apod/nasa_client.py`) amb un `httpx.AsyncClient` compartit creat al `lifespan` ([[0017-injeccio-de-dependencies-i-services-singleton]]). Timeout de connexió de 3 s i total de 10 s; sense reintents.
- **Ordre de consulta:** [[redis]] (`cache:apod:<data>`, 24 h) → [[postgres]] (taula `apod`) → NASA. El que respon la NASA es desa a totes dues.
- **Respostes inservibles:** error HTTP, timeout, JSON invàlid, sense `url` o `media_type` diferent d'`image`/`video` es tracten igual que la NASA caiguda. Llavors es retorna la dada guardada; sense dada, 503 `APOD_UNAVAILABLE` ([[0018-errors-rfc-9457-amb-codis-estables]]).

> [!warning] Farciment de la NASA
> Des que l'APOD es va traslladar a science.nasa.gov, l'API respon amb el logotip de NASA Science i un text genèric en lloc de l'APOD (observat el 2026-10-21). El client el rebutja (`PLACEHOLDER_MEDIA_URL`) i no es desa mai. Si la NASA ho arregla, no cal tocar res; si canvia la URL del farciment, s'ha d'actualitzar la constant.

## Meteorologia i contaminació lumínica

Les fonts concretes no estan fixades als documents consultats: només es parla d'«APIs meteorològiques i de contaminació lumínica». La recomanació de zones combina aquestes dades amb la ubicació de l'esdeveniment i consultes de proximitat PostGIS ([[postgres]]).

## Google Identity

El client inicia OAuth2 + PKCE amb Google; el backend valida el token de Google amb JWKS i emet una sessió pròpia (JWT) ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]).

## FCM

Notificacions push cap a l'app; les programades les dispara l'APScheduler de l'[[api]]. Les preferències es configuren per tipus, data i proximitat.

## Equips d'altres grups

Spotwise (grup 21B): vegeu [[contracte-spotwise]].

## Enllaços

- [[visio-general]], [[arquitectura-fisica]], [[backend-hexagonal]]
- [[api]], [[redis]]
