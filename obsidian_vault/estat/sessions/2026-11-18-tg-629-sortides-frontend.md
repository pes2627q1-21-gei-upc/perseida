---
titol: "Sessió 2026-11-18: frontend de les sortides d'observació (TG-629, tasques #640 a #642)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-629"]
font: "Taiga: TG-629 i tasques #640-#642; decisions de Raquel en aquesta sessió (18/11/2026); revisió de reviewer-arquitectura; proves locals amb Jest i Stryker"
etiquetes: [sessio, frontend, sortides]
---

# Sessió 2026-11-18 · Frontend de les sortides d'observació (TG-629)

## Objectiu

Implementar la part de frontend de TG-629 (tasques #640, #641 i #642) sobre el backend de la PR #101, que ja és a `develop`: formulari de crear i editar, llistes, detall i esborrat amb confirmació.

## Què s'ha fet

- **Dependències:** `expo-location` 58.0.19 i `@react-native-community/datetimepicker` 9.2.1, amb versió fixada. `react-hook-form`, `zod` i `@hookform/resolvers` ja hi eren.
- **Dades (#641):** `api/outings.ts` i `hooks/useOutings.ts`, amb `authHeaders` com les publicacions.
- **Formulari (#640):** `OutingForm` amb la validació de comoditat de `outingForm.ts`, `DateTimeField` (mòbil i web) i `LocationField` amb el mapa de mira central i la ubicació del dispositiu.
- **Llistes, detall i esborrat (#641):** `OutingsScreen`, `OutingDetailScreen` (amb `ConfirmDialog`), `NewOutingScreen` i `EditOutingScreen`, i les quatre rutes.
- **Entrades:** botó a l'inici temporal i botó a la fitxa de l'esdeveniment.
- **Refactor sense canvi de comportament:** `TopBar` a `shared/ui` i `shared/map` (constants del mapa base, Leaflet, `onlyMapPage` i la lectura de la càmera), que eren dins d'`events`.
- **i18n:** claus `outings.*`, `home.outingsLink`, `events.sheet.outings` i `errors.OUTING_*` en ca, es i en, amb els textos aprovats per Raquel.
- **Vault (#642):** secció «Sortides d'observació (TG-629)» a [[frontend]].

## Decisions

Cap ADR nova. Decisions de Raquel:

- El token va amb `authHeaders` a cada crida, com les publicacions. Es va provar primer un middleware al client d'API i es va revertir en veure que `develop` ja tenia aquesta manera de fer-ho.
- El lloc es tria movent el mapa sota una mira central i prement «Tria aquest lloc», amb «Usa la meva ubicació» com a alternativa.
- L'esdeveniment relacionat només es pot treure, no triar: surt preseleccionat si es crea des de la fitxa d'un esdeveniment.
- Data i hora: control natiu a iOS, dia i hora seguits a Android i `datetime-local` a la web.
- Esborrat amb un diàleg de vidre propi, perquè `Alert.alert` no fa res a la web.
- La mira és una icona `Crosshair`, no un `MapPin`, perquè la punta d'una agulla no marcaria el centre.

## Pendent / següents passos

- [ ] PR del frontend cap a `develop` quan Raquel ho demani.
- [ ] Provar a mà el mapa del selector de lloc en un dispositiu Android i a la web (els tests no executen Leaflet).
- [ ] Paginació keyset de `GET /api/outings` (#644, Sprint 3).
- [ ] Un selector d'esdeveniments al formulari, si es vol (fora de la US).

## US de Taiga

- TG-629 (tasques #640, #641, #642; #637-#639 ja tancades)
- #644 (paginació, Sprint 3)
