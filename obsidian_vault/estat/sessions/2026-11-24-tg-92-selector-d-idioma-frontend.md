---
titol: "Sessió 2026-11-24: selector d'idioma i persistència a l'app (TG-92, tasques #593-#597)"
tipus: sessio
estat: vigent
data: "2026-11-24"
us: ["TG-92"]
font: "Taiga: TG-92 i tasques #593-#597; PR 1 (backend, #144); TG-91 (i18n); TG-385 (perfil)"
etiquetes: [sessio, frontend, i18n, accessibilitat, perfil]
---

# Sessió 2026-11-24 · Selector d'idioma a l'app (TG-92, PR 2)

## Objectiu

Segona PR de la TG-92: que la persona triï l'idioma al perfil, que els textos canviïn a l'instant, que es desi al compte i al mòbil, i que en arrencar s'usi el del compte (o l'últim desat si no hi ha connexió). La PR 1 (backend, `PATCH /api/users/me`) ja és a `develop` (#144).

## Què s'ha fet

- **Crida (#593):** `updateLanguage` (`PATCH /api/users/me` amb `authHeaders`). L'idioma del compte es llegeix amb el `getUserProfile` que ja hi havia, sense duplicar-lo.
- **Canvi, desat i arrencada (#594):** `languageStorage` (SecureStore; `localStorage` a web), `useChangeLanguage` (canvi immediat, desat al mòbil i a l'API, error i reintent sense desfer el canvi) i `useStartupLanguage` (idioma desat, després el del compte), connectat a `(app)/_layout.tsx`. `isLanguage` s'exporta de `shared/i18n`.
- **Desplegable (#595):** `LanguageMenu` (globus i codi `CA`/`ES`/`EN`; obert, els tres idiomes pel seu nom) a dalt a la dreta de la targeta d'identitat del perfil. S'ha tret la pastilla d'idioma antiga.
- **Textos i accessibilitat (#596):** `profile.language.*` passen a autònims (Català, Castellano, English) i claus noves `profile.languageMenu.*` als tres idiomes; anunci del canvi per al lector de pantalla; etiquetes, estats i *live regions*. Contrast mesurat amb `contrast.py` sobre `glassSolid` als quatre temes (5,8:1 a 15,2:1).
- **Revisió (#597):** `reviewer-arquitectura` no va trobar cap troballa crítica ni alta. S'han corregit les tres mitjanes de comportament amb TDD: la cursa entre l'arrencada i una elecció de la persona, el desat local que fallava i bloquejava l'API, i l'ordre de dos canvis ràpids (`scope` de la mutació).

- **Mutation testing (Stryker, línies canviades):** 105 mutants, puntuació **80,95 %** (llindar 70 %). 13 supervivents: 4 al càlcul del rol de `ProfileScreen` (test existent massa feble davant d'un rol desconegut), 6 a `LanguageMenu` (la ✓ de l'opció triada i l'anunci amb idioma explícit), 2 a la guarda de `useStartupLanguage` i 1 equivalent (`id` del `scope`). `languageStorage.web.ts` surt sense cobertura a Stryker però té el 100 % a Jest.

## Decisions preses

- **Desat al mòbil amb `expo-secure-store`** (Simona, 2026-11-24): cap dependència nova; no és un secret, però no hi ha emmagatzematge de dades normals. A web, `localStorage`. Política de dependències: [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]].
- **Reutilitzar `profile.language.*` com a noms dels idiomes** (Simona): la pastilla antiga desapareix i no hi ha dues llistes de noms.
- **Desplegable dins la targeta**, a dalt a la dreta (Simona): `GlassPanel` retalla el que sobresurt, així que s'obre dins la targeta.
- **Tancar sessió no esborra ni canvia l'idioma** (Simona): es manté fins a reiniciar; sense sessió, en arrencar, s'usa el del dispositiu.
- **El hook d'arrencada fa servir el `queryClient` compartit**, com `clearSession`, perquè molts tests de navegació renderitzen el layout sense `QueryClientProvider`.

## Canvis al vault

- [[frontend]]: secció «Selector d'idioma i preferència (TG-92)»; el perfil ja no té pastilla d'idioma; s'actualitza el «fora d'abast» de TG-91.
- [[model-de-domini]]: el `PATCH /api/users/me` i els seus errors.

## Errors trobats

Cap error de producció. Al llarg de la sessió, tres errors d'ús de les eines de test als meus propis tests, corregits sense afeblir cap comprovació: `act` sense `await`, `render` i `fireEvent` asíncrons en aquesta versió de RNTL, i el grup de ràdio que es consulta per etiqueta (com a `GelSegmented`). A la tanda completa de Jest, dos tests d'`events` (`MapScreen`, `EventsScreen`) van fallar, però passen quan s'executen sols: possible problema de càrrega, no investigat.

## Pendent / següents passos

- [ ] Prova al dispositiu del desplegable a 360 px, amb lletra gran i en apaïsat: l'error amb «Torna-ho a provar» no ha de quedar retallat per la targeta.
- [ ] A web: tancar el desplegable amb Escape i fletxes; verificar que `announceForAccessibility` sona.
- [ ] Tancar el desplegable amb un toc fora o amb Enrere d'Android.
- [ ] PR 2: obrir-la, revisió d'una persona que no sigui l'autora, CI i SonarQube Cloud; subtasques #593-#597 a Taiga i la US a `Done` (només les persones).

## US de Taiga

- TG-92 (tasques #593, #594, #595, #596, #597)
