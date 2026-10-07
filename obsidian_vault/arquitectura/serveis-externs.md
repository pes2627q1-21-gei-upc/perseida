---
titol: "Serveis externs"
tipus: guia
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-44", "TG-46"]
font: "README.md (arrel), backend/README.md, incepció 1 (NASA Open APIs), incepció 2 §6 i §3, memòria §3.4.1"
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
