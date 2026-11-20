---
titol: "Sessió 2026-11-20 · TG-64 pantalla de la sala i stack de PR"
tipus: sessio
estat: vigent
data: "2026-11-20"
us: ["TG-64", "TG-469", "TG-470"]
font: "Branca feature/TG-64-pantalla-sala (PR D de TG-64, apilada sobre feature/TG-64-peces-sala); git log de la pila (21d739b..406cf57) i documentació TG-470"
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

## Decisions preses

- Disseny: bombolla pròpia de gel i la dels altres de vidre (Frutiger Cosmo, [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]).
- Contracte de l'autor: `author {id, name}`; l'API no exposa ni `author_id` ni el correu.
- Un sol camí de reintent per als enviaments fallits: la bombolla («Reintenta» amb el mateix `clientMessageId`, i «Descarta»); el compositor no té reintent propi.
- Només hàptica, sense so. Detall de l'enviament (`failed`, `uncertain`, `NOT_SUBSCRIBED`, `FORBIDDEN`) a [[frontend#Sala de xat: pantalla i hook de la sala (TG-469)]] i la idempotència a [[0033-xat-per-esdeveniment-sala-missatge-i-flux]].

## Canvis al vault

- [[frontend]]: secció «Sala de xat: pantalla i hook de la sala (TG-469)», límit conegut de les respostes tardanes resolt, `useChatSocket` amb `joinAttempt`.
- Aquesta sessió.

## Pendent / següents passos

- [ ] Prova en dispositiu: teclat a iOS i Android, ordre de lectura de la llista invertida amb VoiceOver i TalkBack, hàptica, anunci dels missatges nous.
- [ ] SonarCloud de les PR i puntuacions de mutation a la CI: no s'han vist en aquesta sessió.
- [ ] Tancar TG-469 i TG-470 a Taiga (ho fa la persona, que també obre i fusiona les PR de la pila).

## Verificat / no verificat

- Verificat en aquesta nota: l'existència dels fitxers, de la ruta i de les peces, i el comportament de `useRoomLive` llegint-ne el codi.
- No verificat aquí: l'estat de la CI, SonarCloud, mutation i qualsevol prova en un dispositiu.

## US de Taiga

- TG-64, TG-469, TG-470
