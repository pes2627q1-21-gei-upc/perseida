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

## Decisions preses

Cap ADR nova: no canvia l'arquitectura. Decisions de la persona responsable:

- **Formularis:** `react-hook-form` i `zod`, com preveu ADR-0020 (primera vegada que s'instal·len).
- **Edició:** al lloc, dins de la mateixa publicació; el comptador de caràcters sempre visible.
- **Autoria a l'app:** `useCurrentUser` amb `GET /api/users/me`, sense camp nou a l'API ni lectura del JWT.
- **Confirmació d'esborrat:** dins de la publicació, no amb `Alert.alert` (React Native Web l'ignora i el panell lateral es fa servir a web).
- **Ubicació:** la secció de publicacions va al final del scroll de la fitxa.
- **Autora sense nom:** l'API retorna `name: null` (mai el correu) i l'app mostra «Usuari/a #xxxxxx» amb els 6 últims caràcters de l'`id`, per distingir dues autores sense nom. L'`id` no és un secret: l'autoria es comprova amb la sessió.
- **Error en recarregar:** si la llista ja tenia publicacions en memòria i la recàrrega falla, se segueixen mostrant, però amb l'error i «Torna-ho a provar» (error trobat a les proves manuals).

## Canvis al vault

- [[model-de-domini]]: secció «Publicacions d'esdeveniment (implementat)» (camps, regles, cursor i endpoints).
- [[api]]: secció «Publicacions d'esdeveniment (TG-628)», US i estat d'implementació.
- [[frontend]]: secció «Publicacions d'esdeveniment (TG-628)».
- Fora del vault: codis `EVENT_NOT_FOUND`, `POST_*` i `INVALID_CURSOR` al catàleg de la skill `gestio-errors` (`references/cataleg-codis.md`).

## Pendent / següents passos

- [x] Nom públic d'una autora sense `display_name`: abans era el seu correu; ara és `null` a l'API i un nom genèric a l'app.
- [ ] Confirmar a la CI que el test de contracte (schemathesis) passa: no s'executa en local perquè buida la base de dades de desenvolupament.
- [ ] Mutation testing del domini `app/domain/posts/` (≥ 70 %).
- [ ] Revisió de `reviewer-arquitectura` sobre el diff de la US.
- [ ] Obrir la PR cap a `develop`, amb l'aprovació d'una persona que no sigui l'autora, i tancar les subtasques a Taiga.
- [ ] Moderació del text (TG-81) i imatges (TG-68).

## US de Taiga

- TG-628 (tasques TG-630 a TG-636)
