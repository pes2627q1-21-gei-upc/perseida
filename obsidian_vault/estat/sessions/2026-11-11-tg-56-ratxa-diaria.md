---
titol: "Sessió 2026-11-11: registre diari i ratxa consecutiva (TG-56, tasques #537 a #541)"
tipus: sessio
estat: vigent
data: "2026-11-11"
us: ["TG-56"]
font: "Taiga: TG-56 i tasques #537 a #541; decisions de l'equip en aquesta sessió (11/11/2026); revisió de reviewer-arquitectura"
etiquetes: [sessio, backend, ratxes, gamificacio, persistencia]
---

# Sessió 2026-11-11 · Registre diari i ratxa consecutiva (TG-56)

## Objectiu

Fer la US TG-56 de cap a cap: registrar l'activitat diària d'un usuari i calcular la ratxa de dies consecutius en el moment de la consulta, sense cap procés programat.

## Què s'ha fet

- Descripció de la US (frase «Com a… vull… per a…» i 6 criteris d'acceptació) i 5 subtasques a Taiga, amb el format de les del Sprint 1.
- Tasca #537: entitat `DailyStreak` amb les regles (`start`, `register_activity`, `count_on`), port `StreakRepository` i `StreakService.register_activity`.
- Tasca #538: taula `daily_streaks`, migració `create_daily_streaks` i `SqlStreakRepository`, amb un upsert que només escriu si la data nova és posterior.
- Tasca #539: `StreakService.get_current_streak`, només de lectura.
- Tasca #540: endpoints `POST /api/streaks/me/activity` i `GET /api/streaks/me`, amb documentació OpenAPI. S'han regenerat `frontend/openapi/openapi.json` i `schema.d.ts`. Els tests existents que esborren usuaris netegen també `daily_streaks`, per la FK `RESTRICT`.
- Tasca #541: tests d'acceptació de punta a punta dels casos límit, actualització del vault i revisió de `reviewer-arquitectura`.
- Primer el commit `test:` en vermell i després el `feat:` a les tasques #537 a #540 (ADR-0028). Els tests de la #541 s'han afegit després del codi, com a tests d'acceptació, i així consta al fitxer.
- Les proves d'integració s'han fet contra una PostgreSQL i un Redis temporals en contenidors propis, sense tocar els del desplegament.

## Decisions preses

Cap ADR nova: no canvia l'arquitectura. Decisions de l'equip i de la persona responsable:

- **El dia és UTC**, igual per a tots els usuaris. S'havia plantejat usar la zona horària de l'usuari, però l'equip va preferir UTC per unificar-ho; l'app no envia cap zona horària.
- **Rutes:** `POST /api/streaks/me/activity` i `GET /api/streaks/me`, en un mòdul propi `streaks`.
- **Resposta:** tots dos retornen `{"current_count": N}`; el POST retorna la ratxa actual perquè l'app no hagi de fer una segona crida.
- **Usuari:** l'identificador surt de la sessió, mai de la ruta ni del cos.
- **Concurrència:** el `save` és un upsert atòmic; amb la mateixa data o una d'anterior no canvia res.
- **Concurrència (review PR #88):** el comptador es calcula dins l'`ON CONFLICT` a partir de la fila guardada (dia següent: `+1`; altrament, el del domini), perquè una lectura antiga no el sobreescrigui a mitjanit UTC. Limitació: si l'escriptura del dia D+1 arriba abans que la del dia D, la del dia D s'ignora; es tancaria amb `SELECT ... FOR UPDATE`.

## Canvis al vault

- [[model-de-domini]]: nova secció «Ratxa diària (implementat)» amb els camps, la regla del dia UTC, les regles de càlcul i els endpoints.

## Pendent / següents passos

- [ ] Confirmar a la CI que el test de contracte (schemathesis) passa amb els endpoints nous; no s'ha pogut executar en local.
- [x] Mutation testing del domini de `streaks` (≥ 70 %): `app/domain/streaks/` afegit a `[tool.mutmut]`; 32 mutants, 32 morts (100 %), executat amb mutmut 3.8.1 a Linux (review de la PR #88).
- [ ] Acordar amb qui faci TG-57 (visualització de la ratxa a l'app) les rutes i el format de la resposta.
- [ ] Decidir si `DailyStreak` valida `current_count >= 1` al domini (ara només ho protegeix la base de dades).
- [ ] Obrir la PR cap a `develop`, amb l'aprovació d'una persona que no sigui l'autora, i tancar les subtasques a Taiga.

## US de Taiga

- TG-56 (tasques TG-537, TG-538, TG-539, TG-540 i TG-541)
