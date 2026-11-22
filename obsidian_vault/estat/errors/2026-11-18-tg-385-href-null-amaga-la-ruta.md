---
titol: "TG-385: href null amaga la ruta del navegador"
tipus: error-testing
estat: corregit
data: "2026-11-18"
us: ["TG-385"]
fase: prova-manual
capa: frontend
regressio: "frontend/src/features/navigation/__tests__/hiddenRoutes.test.tsx"
commit:
llico: convencio
etiquetes: [error-testing]
---

# TG-385: `href: null` amaga la ruta del navegador

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

A la prova manual web, els botons «Obre el mapa d'esdeveniments» i «Imatge del dia» tornaven a l'inici en lloc d'obrir la pantalla.

## Causa

A expo-router 58, `href: null` treu la ruta del navegador de pestanyes, no només la pestanya de la barra. Els tests anteriors simulaven `push` i no detectaven que la ruta ja no existia.

## Correcció

Les rutes amagades fan servir `tabBarButton: () => null` (i `tabBarItemStyle: { display: 'none' }`).

## Test de regressió

`hiddenRoutes.test.tsx`, amb el router real en lloc d'un `push` simulat. `AppLayoutTabs.test.tsx` comprova que les opcions de les rutes amagades no tenen `href`.

## Lliçó

Un test que simula la navegació no prova que la ruta existeixi: les rutes de navegació es proven amb el router real. Recollit a [[testing#Retroalimentació dels errors trobats (TG-657)]].

Origen: [[2026-11-18-tg-385-navegacio-i-perfil]].
