---
titol: "Sessió 2026-11-10: TG-50, fonts d'esdeveniments sota demanda (PR 1 i 2) i seguiment de l'Sprint 2"
tipus: sessio
estat: vigent
data: "2026-11-10"
us: ["TG-50", "TG-536", "TG-351", "TG-64"]
font: "Taiga (Sprint 2, TG-50 i tasques #501-#509, 10/11/2026); calendaris de la IMO 2026 i 2027; API de fases lunars de l'USNO; CI de develop i SonarQube Cloud (10/11/2026); spike de fonts (Launch Library 2, USNO, PyPI de skyfield); decisions de Manel (SM)"
etiquetes: [sessio, esdeveniments, backend, sprint-2, sonar]
---

# Sessió 2026-11-10 · TG-50 (PR 1 i 2) i seguiment de l'Sprint 2

## Objectiu

Portar la primera meitat de TG-50 (fonts, cache, upsert i `exists`) i, com a SM, revisar l'estat de l'Sprint 2 i crear la US que va demanar l'Oriol per a SonarQube.

## Què s'ha fet

- **Sprint 2 (SM):** a dia 13 de 32, 5 de 30 US fetes. El repartiment de la [[2026-10-30-planificacio-sprint-2|planificació]] es manté (45-52 SP per persona), però 10 US no compleixen el DoR: #56, #57, #58, #59 i #92 (Simona), #61 i #93 (Xavi), i #49, #51 i #53 (Manel, sense descripció).
- **SonarQube:** des de la PR #79 (TG-194, 9/11), el job `sonar` falla a cada push a `develop` per `new_reliability_rating` = C. Són 5 troballes de codi anterior a Sonar; les PR passen perquè només s'hi analitza el diff. US **TG-536** creada a l'Sprint 2 i assignada a l'Oriol.
- **TG-50, PR 1** (branca `feature/TG-50-fonts-esdeveniments`): TDD amb el `test:` abans del `feat:`.
  - Domini: `EventDraft`, `EventSourceName` i el port `EventSource`; `upsert_many` i `exists` a `EventRepository`.
  - `EventService` refresca les fonts sota demanda amb la marca `events:<font>`; si una font falla, es deixa 15 min.
  - `SqlEventRepository.upsert_many` (`ON CONFLICT (source, external_id)`, conserva l'`id`) i `exists`.
  - `LaunchLibraryEventSource` amb una fixture real, com a molt una crida per hora, i `EventsSettings` al `lifespan`.
  - PR #84 oberta; CI i Quality Gate en verd (cobertura del codi nou 99,3 %). La revisió de `reviewer-arquitectura` va demanar treure duplicats de l'upsert i que la quota no comptés com a fallada: fet.
  - Review de l'Oriol a la PR #84 (canvis demanats), corregida:
    - un registre amb NUL o amb un `external_id` de més de 255 caràcters feia fallar tot l'upsert: ara `EventDraft` el rebutja;
    - un element que no era un objecte invalidava la pàgina: ara els elements es validen d'un en un (també a l'USNO, a la PR 2);
    - amb dues consultes concurrents, la segona podia respondre sense els llançaments: ara, amb la quota, la font torna els de l'última crida.
- **TG-50, PR 2** (branca `feature/TG-50-usno-skyfield-cataleg`, sortida de la PR 1):
  - `UsnoSolarEclipseSource` amb fixtures reals de 2026 i 2027.
  - `SkyfieldLunarSource` amb un retall de DE421 (400 KB); valors contrastats amb l'API de fases lunars de l'USNO i amb els eclipsis de 2026.
  - `MeteorShowerCatalogSource` amb les 9 pluges principals de 2026 i 2027, copiades de la taula 5 dels calendaris de la IMO.
  - `skyfield` 1.55 fixat amb `uv`; les fonts es refresquen en paral·lel.

## Decisions preses

- [[0031-fonts-d-esdeveniments-sota-demanda|ADR-0031]] (proposada): fonts per categoria, TTL, comportament amb fonts caigudes i quota de Launch Library 2. És la 0031 perquè la 0030 és la del WebSocket.
- Skyfield per a la lluna (dependència nova aprovada per Manel).
- Eclipsis solars de l'USNO: tot el dia UTC i sense ubicació.
- TG-50 es parteix en dues PR: la #84 (LL2, servei, persistència) i una segona (USNO, Skyfield, catàleg).
- **Efemèrides:** en lloc de baixar DE421 sencer al Dockerfile, un retall 2026-2030 versionat al repo (Manel).
- **Pluges d'estels:** les 9 principals i tot el període d'activitat (Manel).

## Canvis al vault

- Nova [[0031-fonts-d-esdeveniments-sota-demanda]] i entrada a l'índex.
- [[model-de-domini]]: `upsert_many`, `exists`, `EventDraft` i `EventSource`.
- [[serveis-externs]]: secció d'esdeveniments amb Launch Library 2 i l'USNO.
- [[contracte-spotwise]]: d'on surten les dades del servei d'esdeveniments.
- [[2026-11-09-tg-351-repositori-esdeveniments]]: tancat el pendent dels valors de `source`.

## Pendent / següents passos

- [x] Executar els tests d'integració de `upsert_many` i `exists` amb PostgreSQL: passen a la CI de la PR #84.
- [x] Obrir la PR 1 de TG-50 cap a `develop`: PR #84.
- [ ] Fusionar la PR #84 i obrir la PR 2 cap a `develop` (després de la #84, perquè en surt).
- [x] Canviar «ADR-0030» per «ADR-0031» a la descripció de TG-50 a Taiga.
- [ ] Afegir el calendari de la IMO de 2028 al catàleg quan es publiqui, si el projecte continua.
- [ ] Que Simona i Xavi passin les seves US a Ready; redactar #49, #51 i #53.
- [ ] Posar punts a TG-536.

## US de Taiga

- TG-50, TG-536, TG-351, TG-64
