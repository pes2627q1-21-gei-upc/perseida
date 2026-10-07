---
name: frontend-jocs-dinamics
description: Implementa el quiz diari i la gamificació (ratxes, assoliments, recompenses), minijocs 2D amb skia, reanimated i gesture-handler, visualitzacions de cel/3D i microinteraccions. Usa-la quan la feature sigui un joc, una dinàmica de recompensa o una visualització animada.
---

# Frontend: jocs i dinàmiques

Implementa la capa de presentació i interacció de la gamificació: quiz diari, ratxes, assoliments, recompenses animades, minijocs 2D, visualitzacions de cel/3D i microinteraccions. La puntuació, els premis i les ratxes VIUEN AL BACKEND: el client només mostra i envia accions (frontend "tonto").

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Estètica: `frontend-component/references/frutiger-cosmo.md`; criteri de disseny i animació: `ui-ux-pro-max` i `frontend-design`. Errors/toasts: `gestio-errors`. **Accessibilitat obligatòria (WCAG 2.2 AA):** tot el que es fa ha de complir la guia `../frontend-component/references/accessibilitat.md`.

## Quan usar-la / quan NO
- Usa-la: pantalles de quiz, ratxa, assoliments, minijoc per desafiar amics, visualització del cel/3D, partícules, hàptics.
- NO: pàgines genèriques (`frontend-pagina`), formularis (`frontend-formulari`), crides a l'API (`frontend-crida-api`), components base (`frontend-component`), càlcul de puntuació/premis (backend).

## Protocol de dubtes (OBLIGATORI)
No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes concretes d'aquesta skill (abans d'escriure):
1. Quina US/criteris (TG-NN) i quina mecànica exacta (regles del joc, durada, condicions de victòria, ratxa, assoliments)? No inventis mecàniques.
2. Quins endpoints del backend validen respostes, puntuen i atorguen premis (OpenAPI)? Si no existeixen, aturar-se: la lògica no es posa al client.
3. Quin és el contingut (preguntes del quiz, assets, sons)? Origen i llicència. Qui l'aprova?
4. Tecnologia per a aquest cas: només `@shopify/react-native-skia` + `react-native-reanimated` + `react-native-gesture-handler` (2D) o cal `expo-gl` + three (3D)? **Preguntar abans d'afegir qualsevol dependència**; versió fixada amb pnpm (verifica'n l'existència i compatibilitat amb Expo).
5. Quins hàptics (`expo-haptics`), sons i partícules són desitjats? Com s'apaguen (configuració de l'usuari)?
6. Alternativa per a **reduced motion** i per a gestos (botons com a alternativa a arrossegar)?
7. Pressupost de rendiment: dispositius mínims objectiu per a 60 fps?
8. Mode multijugador/desafiar amics: transport (REST/WebSocket) i qui arbitra? (a backend)
9. Accessibilitat (WCAG 2.2 AA): quins límits o decisions cal confirmar per a això (escala de text, anuncis `polite`/`assertive`, variant d'alt contrast, eines de test)? Vegeu les preguntes d'accessibilitat de la guia.

## Passos
1. Llegeix el vault (gamificació, model de domini, contracte d'API) i reutilitza components i tokens existents.
2. Resol les preguntes. No avancis sense contracte d'API per a puntuació/premis.
3. Separa **lògica de presentació** (hooks: estat de la partida, temporitzador, seqüència d'animació) de **render** (components skia/reanimated). Les accions es validen i puntuen al backend; el client mostra el resultat que retorna.
4. Quiz diari/gamificació: pantalla amb estats loading/empty/error, resultat i recompensa animats; ratxes i assoliments llegits de l'API (mai calculats al client).
5. Minijoc 2D: bucle amb `react-native-reanimated` (valors compartits, worklets) i dibuix amb skia; entrada amb `react-native-gesture-handler`; sense `setState` per fotograma; sense assignar objectes al bucle calent.
6. Visualitzacions de cel/3D: skia per a 2D; `expo-gl` + three només amb permís exprés.
7. Microinteraccions: hàptic en confirmar/encertar, partícules, brillantors Frutiger; durades i easings dels tokens `motion`.
8. **Reduced motion**: consulta la preferència del sistema; substitueix animacions per canvis d'estat estàtics o fundits d'opacitat curts, i desactiva partícules/hàptics si cal. Sempre amb alternativa funcional.
9. Rendiment 60 fps: només animar `transform`/`opacity`; limita capes de blur; pausa el bucle en segon pla; mesura en un dispositiu modest.
10. Accessibilitat: el joc ha de tenir alternativa sense gest, etiquetes, contrast, no dependre només del color/so; textos per i18n ca/es/en.
11. Escriu els tests (després del codi) i passa la checklist.

## Plantilla de codi (orientativa: el repo encara no té codi)
```tsx
// illustrative: presentation only; scoring and rewards come from the backend
import { useReducedMotion } from 'react-native-reanimated';
import { useSubmitAnswer } from '@/features/quiz/hooks/useSubmitAnswer'; // hook over openapi-fetch

export function QuizAnswer({ questionId, optionId }: { questionId: string; optionId: string }) {
  const reduceMotion = useReducedMotion();
  const submit = useSubmitAnswer();
  // 1) send the answer; 2) show the result/reward returned by the API;
  // 3) play the celebration unless reduceMotion; never compute points here.
}
```
Noms i hooks d'exemple; confirma'ls amb el repo. Les llibreries s'han d'haver acordat amb l'humà.

## Tests (després del codi)
- Jest + RNTL per a hooks de lògica de presentació (estat de la partida, temporitzador, mapatge del resultat de l'API); API simulada.
- Que reduced motion tria la variant sense moviment; que els errors passen per `gestio-errors`.
- Els components visuals (skia/animacions) queden exclosos de cobertura; verifica'ls manualment (rendiment i gestos en dispositiu) a la branca de release.
- Cobertura de hooks >=70%.

## Checklist final
- [ ] Protocol `vault-context` seguit; mecànica i contingut confirmats per l'humà.
- [ ] Puntuació, premis i ratxes viuen al backend; el client només els mostra.
- [ ] Dependències noves aprovades i amb versió fixada amb pnpm.
- [ ] Reduced motion respectat amb alternativa funcional; alternativa als gestos.
- [ ] 60 fps verificats en dispositiu; només `transform`/`opacity` animats.
- [ ] Hàptics/sons/partícules desactivables.
- [ ] Textos per i18n ca/es/en; zero valors hardcodejats; estètica Frutiger Cosmo.
- [ ] Accessibilitat i checklist de `ui-ux-pro-max/references/pro-rules.md`.
- [ ] Tests de hooks escrits.
- [ ] Accessibilitat WCAG 2.2 AA: checklist de `../frontend-component/references/accessibilitat.md` completada (lectors i i18n, text gran i contrast, reduce motion, teclat/focus, tests per rol/etiqueta).

## Què NO fer
- No calculis puntuació, premis o ratxes al client ni confiïs en el resultat local.
- No afegeixis `expo-gl`, three ni cap altra dependència sense preguntar.
- No ignoris reduced motion ni facis `setState` per fotograma.
- No inventis mecàniques, contingut ni endpoints.
- No dupliquis `gestio-errors`; no editis `.claude/skills/`.
