---
titol: "Sessió 2026-11-20 · TG-64 pantalla de la sala i stack de PR"
tipus: sessio
estat: vigent
data: "2026-11-20"
us: ["TG-64", "TG-469", "TG-470"]
font: "Branca feature/TG-64-pantalla-sala (PR D de TG-64, apilada sobre feature/TG-64-peces-sala); git log de la pila (origin/feature/TG-64-peces-sala..HEAD, de 57f1466 a 834f373) i documentació TG-470"
etiquetes: [sessio, frontend, xat, accessibilitat, pr-apilades]
---

# Sessió 2026-11-20 · TG-64 pantalla de la sala i stack de PR

## Objectiu

Tancar el client del xat d'esdeveniment (TG-64): muntar la pantalla de la sala amb les peces de la sessió anterior i deixar la documentació al dia (TG-470).

## Què s'ha fet

La US es va partir en quatre PR apilades amb `gh stack` ([[pr-apilades-amb-gh-stack]]), cadascuna sobre la d'abaix:

- **PR A, autor als missatges** (`feature/TG-64-autor-missatges`): el backend exposa l'autor com a `{id, name}` (nom de perfil) en lloc d'`author_id`, a REST i WebSocket; OpenAPI i tipus del frontend regenerats.
- **PR B, llista de sales** (`feature/TG-64-llista-sales`): la pestanya de xat és una carpeta amb `Stack` i mostra la llista (`ChatRoomsScreen`, `RoomListItem`, `useMySubscriptions`).
- **PR C, peces de la sala** (`feature/TG-64-peces-sala`): bombolla, compositor i llista; vegeu [[2026-11-19-tg-469-peces-sala-xat]].
- **PR D, pantalla de la sala** (`feature/TG-64-pantalla-sala`): `ChatRoomScreen`, ruta `/chat/[eventId]`, `useRoomLive`, barra de pestanyes amagada a la sala i hàptica amb `expo-haptics` 58.0.7. Les files de la llista obren la sala.
- Canvis de `useChatSocket` (`joinAttempt`) i de `socketClient` (descarta les respostes tardanes d'un `send` ja resolt).
- **TG-470, documentació:** README del frontend en els tres idiomes, la secció de la pantalla i de `useRoomLive` a [[frontend#Sala de xat: pantalla i hook de la sala (TG-469)]], i aquesta nota. Abans, a la mateixa branca, ADR-0033 i la nota del component, el README del backend, les notes de domini, api, redis, moderation, postgres i l'índex, la guia del stack i les skills de revisió.

## Després de la primera ronda

- **Prova al navegador** amb la sessió de la persona contra un backend **local**: va trobar tres defectes (icona d'enviament invisible a la web, error en tocar «Reintenta» a la web i contrast baix dels botons d'acció) i el solapament de la pastilla de connexió amb la llista. Es van corregir amb prova en vermell prèvia (`GelIconButton` amb la icona en una capa posicionada, `moveFocusTo`, `ActionSurface`, farciment de la llista sota l'avís de connexió).
- **Dues revisions d'arquitectura** i les rondes de correcció: l'ack de cada `subscribe` posa l'historial al dia (`onJoined`; `cancelQueries` i `refetch`), `socketClient` oblida els `subscribe` sense resposta en sortir d'una sala, `addMessage` desa per `sent_at` i els separadors de dia tenen clau única, la regió viva d'Android es torna a muntar a cada arribada, el focus va al camp després de «Descarta», el compositor perd la prop `error` morta i `send` no rebutja mai, el backend no consulta els autors d'una pàgina buida i `add_message` fa `INSERT … RETURNING`.
- **Barra de pestanyes:** etiquetes curtes visibles (`nav.short.*`) per a Esdeveniments i Gamificació; el nom accessible continua sent el llarg.
- **Proves:** `jest.setup.js` amb temporitzadors de TanStack `unref` i `__mocks__/pendingResponses.ts`, perquè la suite ja no imprimeixi «worker failed to exit gracefully»; proves de comportament que maten mutants supervivents de Stryker.
- **Mutation del backend**, mesurat amb Docker sobre una còpia amb `mutmut` apuntant a `app/application/chat` (l'script de CI només muta `app/domain`): domini del xat 100 % i `chat_service.py` 79,57 %.
- **Lliçó de seguretat:** `frontend/.env` apunta a producció; les proves locals han d'anul·lar-ho amb `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`. Les dades de demostració només s'han inserit a la base de dades local.

## Decisions preses

- Disseny: bombolla pròpia de gel i la dels altres de vidre (Frutiger Cosmo, [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]).
- Contracte de l'autor: `author {id, name}`; l'API no exposa ni `author_id` ni el correu.
- Un sol camí de reintent per als enviaments fallits: la bombolla («Reintenta» amb el mateix `clientMessageId`, i «Descarta»); el compositor no té reintent propi.
- Només hàptica, sense so. Detall de l'enviament (`failed`, `uncertain`, `NOT_SUBSCRIBED`, `FORBIDDEN`) a [[frontend#Sala de xat: pantalla i hook de la sala (TG-469)]] i la idempotència a [[0033-xat-per-esdeveniment-sala-missatge-i-flux]].

## Canvis al vault

- [[frontend]]: etiquetes curtes de la barra, `addMessage` ordenat, `moveFocusTo`, `ActionSurface`, ack de `subscribe` i límits coneguts; secció «Sala de xat: pantalla i hook de la sala (TG-469)», límit conegut de les respostes tardanes resolt, `useChatSocket` amb `joinAttempt`.
- [[0030-protocol-websocket-i-revocacio-per-pub-sub]], [[0033-xat-per-esdeveniment-sala-missatge-i-flux]], [[chat]] i [[model-de-domini]]: repositori (`page` sense autors si és buida, `add_message` amb `RETURNING`) i mutation.
- Aquesta sessió.

## Pendent / següents passos

- [ ] Prova en dispositiu: teclat a iOS i Android, ordre de lectura de la llista invertida amb VoiceOver i TalkBack, nou anunci de la regió viva a TalkBack, cost de les ombres en llistes llargues a Android, etiquetes curtes de la barra amb la mida de lletra per sobre d'1,4, hàptica, anunci dels missatges nous.
- [ ] CI, SonarCloud de les PR i puntuació real de mutation de les capes del frontend a la CI: no s'han vist en aquesta sessió.
- [ ] Tancar TG-469 i TG-470 a Taiga (ho fa la persona, que també obre i fusiona les PR de la pila).

## Verificat / no verificat

- Verificat: l'existència dels fitxers, de la ruta i de les peces, el comportament de `useRoomLive` llegint-ne el codi, la prova al navegador contra el backend local i la mutation del backend (Docker) indicada a dalt.
- No verificat aquí: l'estat de la CI, SonarCloud, mutation i qualsevol prova en un dispositiu.

## US de Taiga

- TG-64, TG-469, TG-470
