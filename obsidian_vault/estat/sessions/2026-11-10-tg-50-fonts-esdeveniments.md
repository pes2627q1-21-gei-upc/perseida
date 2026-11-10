---
titol: "Sessió 2026-11-10: TG-50, fonts d'esdeveniments sota demanda (PR 1) i seguiment de l'Sprint 2"
tipus: sessio
estat: vigent
data: "2026-11-10"
us: ["TG-50", "TG-536", "TG-351", "TG-64"]
font: "Taiga (Sprint 2, TG-50 i tasques #501-#509, 10/11/2026); CI de develop i SonarQube Cloud (10/11/2026); spike de fonts (Launch Library 2, USNO, PyPI de skyfield); decisions de Manel (SM)"
etiquetes: [sessio, esdeveniments, backend, sprint-2, sonar]
---

# Sessió 2026-11-10 · TG-50 (PR 1) i seguiment de l'Sprint 2

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
  - Review de l'Oriol a la PR #84 (canvis demanats), corregida:
    - un registre amb NUL o amb un `external_id` de més de 255 caràcters feia fallar tot l'upsert: ara `EventDraft` el rebutja;
    - un element que no era un objecte invalidava la pàgina: ara els elements es validen d'un en un;
    - amb dues consultes concurrents, la segona podia respondre sense els llançaments: ara, amb la quota, la font torna els de l'última crida.

## Decisions preses

- [[0031-fonts-d-esdeveniments-sota-demanda|ADR-0031]] (proposada): fonts per categoria, TTL, comportament amb fonts caigudes i quota de Launch Library 2. És la 0031 perquè la 0030 és la del WebSocket.
- Skyfield amb les efemèrides `de421.bsp` dins la imatge Docker (dependència nova aprovada per Manel).
- Eclipsis solars de l'USNO: tot el dia UTC i sense ubicació.
- TG-50 es parteix en dues PR: aquesta (LL2, servei, persistència) i una segona (USNO, Skyfield, catàleg).

## Canvis al vault

- Nova [[0031-fonts-d-esdeveniments-sota-demanda]] i entrada a l'índex.
- [[model-de-domini]]: `upsert_many`, `exists`, `EventDraft` i `EventSource`.
- [[serveis-externs]]: secció d'esdeveniments amb Launch Library 2.
- [[2026-11-09-tg-351-repositori-esdeveniments]]: tancat el pendent dels valors de `source`.

## Pendent / següents passos

- [ ] Executar els tests d'integració de `upsert_many` i `exists` amb PostgreSQL (en local no hi havia Docker; els passarà la CI).
- [ ] Obrir la PR 1 de TG-50 cap a `develop` (la fa Manel).
- [ ] PR 2 de TG-50: USNO (#505), Skyfield i `de421` al Dockerfile (#505), catàleg de pluges d'estels (#506) i vault (#509).
- [ ] Canviar «ADR-0030» per «ADR-0031» a la descripció de TG-50 a Taiga.
- [ ] Que Simona i Xavi passin les seves US a Ready; redactar #49, #51 i #53.
- [ ] Posar punts a TG-536.

## US de Taiga

- TG-50, TG-536, TG-351, TG-64
