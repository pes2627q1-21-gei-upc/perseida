---
titol: "Sessió 2026-11-17: publicacions de text en un esdeveniment (TG-628, tasques #630 a #636)"
tipus: sessio
estat: vigent
data: "2026-11-17"
us: ["TG-628"]
font: "Taiga: TG-628 i tasques #630 a #636; decisions de la persona responsable en aquesta sessió (17/11/2026)"
etiquetes: [sessio, backend, frontend, comunitat, publicacions, persistencia]
---

# Sessió 2026-11-17 · Publicacions de text en un esdeveniment (TG-628)

## Objectiu

Fer la US TG-628 de cap a cap: publicar, llistar, editar i esborrar publicacions de text sota un esdeveniment, al backend i a la fitxa de l'esdeveniment de l'app.

## Què s'ha fet

- Tasca #630: entitat `Post`, value object `PostAuthor`, cursor i port `PostRepository`, amb el mateix netejat del text que el xat.
- Tasca #631: `PostService` (crear, llistar amb cursor opac, editar i esborrar només l'autora).
- Tasca #632: taula `posts`, migració `create_posts` i `SqlPostRepository`, amb proves d'integració contra PostgreSQL.
- Tasca #633: router amb els quatre endpoints, errors RFC 9457 documentats a OpenAPI i `frontend/openapi/openapi.json` regenerat. El test de contracte (schemathesis) accepta els 422 dels endpoints de publicacions.
- Tasca #634: `react-hook-form`, `zod` i `@hookform/resolvers` (versions fixades, [[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020]]), `schema.d.ts` regenerat, hooks de TanStack Query i `PostForm` per crear i editar.
- Tasca #635: `useCurrentUser` (`GET /api/users/me`), `PostItem` i `EventPosts` al final de la fitxa de l'esdeveniment, amb edició al lloc, esborrat amb confirmació i estats de càrrega, buit i error. `authHeaders` s'ha mogut a `features/auth` per compartir-lo.
- Tasca #636: vault i catàleg de codis d'error.
- TDD estricte: a cada tasca, el commit `test:` en vermell abans del `feat:` ([[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]]). Frontend: 595 tests en verd, lint i tipus nets; cobertura del codi nou per sobre del 90 %.
- La sessió va començar a Antigravity (tasques #630 a #632) i va continuar a Claude Code des de la #633.
- Tancament abans de la PR, amb la revisió de `reviewer-arquitectura` i el mutation testing:
  - La neteja del text de les usuàries era una còpia de la del xat: ara és `clean_user_text` i `has_visible_text` a `app/domain/shared/text.py`, compartides. La regex es construeix a nivell de mòdul, sense funcions auxiliars que mutmut no pot provar.
  - Mutation testing del domini: el 69,7 % inicial no arribava al llindar; ara és del 89,1 %.
  - `event_id` tenia un índex sobrer que la migració no creava (`test_models_match_migrations` fallava).
  - El cursor fa una comparació de fila, que entra com a *Index Cond* (comprovat amb `EXPLAIN`). Hi ha un test nou de desempat per `id`.
  - OpenAPI: s'hi documenten el 422 de `DELETE` (que era `HTTPValidationError` en lloc de `problem+json`) i el 429 del proxy a `/api/events/{event_id}/posts`.
  - Accessibilitat: el focus va al camp en editar, la confirmació d'esborrat és una alerta i l'error del text va al hint del camp. El comptador compta punts de codi, com el servidor.

## Decisions preses

Cap ADR nova: no canvia l'arquitectura. Decisions de la persona responsable:

- **Formularis:** `react-hook-form` i `zod`, com preveu ADR-0020 (primera vegada que s'instal·len).
- **Edició:** al lloc, dins de la mateixa publicació; el comptador de caràcters sempre visible.
- **Autoria a l'app:** `useCurrentUser` amb `GET /api/users/me`, sense camp nou a l'API ni lectura del JWT.
- **Confirmació d'esborrat:** dins de la publicació, no amb `Alert.alert` (React Native Web l'ignora i el panell lateral es fa servir a web).
- **Ubicació:** la secció de publicacions va al final del scroll de la fitxa.
- **Autora sense nom:** l'API retorna `name: null` (mai el correu) i l'app mostra «Usuari/a #xxxxxx» amb els 6 últims caràcters de l'`id`, per distingir dues autores sense nom. L'`id` no és un secret: l'autoria es comprova amb la sessió.
- **Mutation testing del frontend només sobre les línies canviades:** Stryker donava 54 %: mutava sencer `EventSheet.tsx` (codi de TG-52) per dues línies tocades, i la majoria de supervivents eren valors d'estil. `run-stryker-diff.mjs` ara passa a Stryker rangs `fitxer:inici-final` de les línies afegides o canviades, i s'han afegit tests reals per als supervivents de lògica (vegeu [[testing]]).
- **Temps de Stryker a la CI:** amb les 9 peces de la US surten 372 mutants, i amb `concurrency: 2` Stryker necessitava uns 25 minuts, més que els 15 del job `frontend`. Ara fa servir els 4 vCPU del runner (`concurrency: 4`) i el job té 30 minuts de marge.
- **CI en vermell a la PR:** els fixtures d'esdeveniments ara fan `TRUNCATE ... CASCADE` (`posts` referencia `astronomical_events`). El 405 llista a `Allow` tots els mètodes del path, perquè un path pot tenir una ruta per mètode i schemathesis ho comprova. Jest ja no executa els tests dels scripts, que van amb `node --test`.
- **Revisió de la PR #102 (canvis demanats):**
  - `PostService` importava `app.domain.events.ports.EventRepository`, que trencava la independència entre features ([[backend-hexagonal]]). Ara té el port propi `EventLookup` a `app/domain/posts/ports.py`, i el contracte d'import-linter «The posts do not import other features» ho vigila.
  - El mutation testing del frontend per línies s'ha documentat com a esmena d'[[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] i de la [[definition-of-done]].
  - El límit de peticions de `PATCH` i `DELETE` queda en una issue de seguiment a Taiga.
  - Les publicacions d'un compte esborrat que mostren el `display_name` queden fora de l'abast: van a una US de privacitat.
- **Error en recarregar:** si la llista ja tenia publicacions en memòria i la recàrrega falla, se segueixen mostrant, però amb l'error i «Torna-ho a provar» (error trobat a les proves manuals).

## Canvis al vault

- [[model-de-domini]]: secció «Publicacions d'esdeveniment (implementat)» (camps, regles, cursor i endpoints).
- [[api]]: secció «Publicacions d'esdeveniment (TG-628)», US i estat d'implementació.
- [[frontend]]: secció «Publicacions d'esdeveniment (TG-628)».
- [[testing]]: el mutation testing del frontend només muta les línies canviades.
- [[seguretat]]: `clean_user_text` a la taula de defensa al domini.
- [[backend-hexagonal]]: contracte de `posts` i port `EventLookup`.
- [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]] i [[definition-of-done]]: esmena del mutation testing del frontend per línies.
- Fora del vault: codis `EVENT_NOT_FOUND`, `POST_*` i `INVALID_CURSOR` al catàleg de la skill `gestio-errors` (`references/cataleg-codis.md`).

## Pendent / següents passos

- [x] Nom públic d'una autora sense `display_name`: abans era el seu correu; ara és `null` a l'API i un nom genèric a l'app.
- [ ] Confirmar a la CI que el test de contracte (schemathesis) passa: no s'executa en local perquè buida la base de dades de desenvolupament.
- [x] Mutation testing del domini `app/domain/posts/` (≥ 70 %): 89,1 % amb mutmut.
- [x] Revisió de `reviewer-arquitectura` sobre el diff de la US: cap troballa crítica; l'alta i les mitjanes, resoltes.
- [ ] Límit de peticions de `PATCH` i `DELETE /api/posts/*` (el proxy només limita `/api/events/`): issue de seguiment a Taiga.
- [ ] US de privacitat: què es mostra de l'autora d'una publicació quan el seu compte s'ha esborrat.
- [ ] Noms accessibles diferents per a «Edita» i «Esborra» de cada publicació pròpia (ara els distingeix només el context).
- [ ] Obrir la PR cap a `develop`, amb l'aprovació d'una persona que no sigui l'autora, i tancar les subtasques a Taiga.
- [ ] Moderació del text (TG-81) i imatges (TG-68).

## US de Taiga

- TG-628 (tasques TG-630 a TG-636)
