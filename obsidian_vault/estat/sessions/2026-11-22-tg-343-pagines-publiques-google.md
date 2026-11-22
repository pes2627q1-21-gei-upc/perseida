---
titol: "Sessió 2026-11-22: pàgines públiques per publicar l'app a Google Auth Platform (TG-343)"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-343"]
font: "Taiga: TG-343 i tasques #344 a #350; spike de Manel a Google Auth Platform i Search Console (22/11/2026); decisions de Manel (22/11/2026)"
etiquetes: [sessio, infra, nginx-proxy-manager, oauth, privacitat]
---

# Sessió 2026-11-22 · Pàgines públiques per a Google Auth Platform (TG-343)

## Objectiu

Deixar a punt el que Google demana per publicar l'app com a «In production» (que entri qualsevol compte de Google): pàgina principal, política de privacitat i condicions del servei públiques, i documentar el resultat del spike del domini.

## Què s'ha fet

- **Spike (#344):** a la consola, `perseida.duckdns.org` ja era un domini autoritzat i s'accepta. Search Console accepta la propietat `https://perseida.duckdns.org:40431/` (prefix d'URL amb port) amb verificació per fitxer HTML o etiqueta `meta`; es fa servir l'etiqueta.
- **Pàgines:** `infra/nginx-proxy-manager/public/` amb `index.html`, `privacy.html` i `terms.html`, en ca/es/en i sense scripts. La política descriu les dades reals del model (compte de Google, perfil, contingut, sortides amb ubicació, sessió de 30 dies com a màxim i registres tècnics).
- **Servir-les:** tres `location =` a `static.conf` amb CSP sense scripts, muntatge de només lectura al Compose i còpia al servidor al CD.
- **Revisió d'arquitectura:** cap problema al codi; s'ha corregit el text perquè coincideixi amb el sistema real (la moderació, com a possibilitat, perquè TG-81 encara no hi és; la posició de «A prop meu» queda als registres tècnics; l'esborrat és a mà en 30 dies).
- **Proves:** `infra/scripts/test-public-pages.sh` (TDD: el `test:` va abans dels `feat:`), al job `proxy` de la CI. També passa `test-rate-limit.sh`, que inclou `static.conf`.

## Decisions preses

Totes de Manel, del 22/11/2026:

- Les pàgines les serveix nginx-proxy-manager des d'una carpeta, no el backend ([[0009-nginx-proxy-manager-serveix-media-i-spa-admin|ADR-0009]]).
- Responsable del tractament: l'equip de Perseida, sense noms personals.
- Contacte: un Gmail d'equip nou, no el correu personal d'una persona.
- Retenció: mentre existeixi el compte, amb esborrat a mà en 30 dies com a màxim si es demana (procediment al README d'`infra/`), i tot en apagar el servidor al final del quadrimestre.

## Canvis al vault

- [[0008-google-oauth2-pkce-jwks-i-sessio-propia|ADR-0008]]: concreció de TG-343 (resultat del spike, verificació, pàgines, tractament de dades) i alternatives descartades.
- [[nginx-proxy-manager]]: secció «Pàgines públiques (TG-343)» i les rutes noves.

## Pendent / següents passos

- [ ] Posar el correu d'equip a les tres pàgines (marcador `CORREU_EQUIP_PENDENT`) abans de fusionar.
- [ ] Després del desplegament a producció: tornar a enganxar `static.conf` a «Advanced» d'NPM i comprovar els tres 200.
- [ ] Verificar la propietat a Search Console, omplir el Branding i publicar l'app (#348); provar el login amb un compte que no sigui de test (#349).

## US de Taiga

- TG-343
