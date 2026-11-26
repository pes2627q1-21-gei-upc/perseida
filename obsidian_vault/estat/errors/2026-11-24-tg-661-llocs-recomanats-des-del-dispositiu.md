---
titol: "TG-661: els llocs recomanats de la sortida es busquen des del dispositiu"
tipus: error-testing
estat: corregit
data: "2026-11-24"
us: ["TG-661", "TG-352"]
font: "Prova manual web de Raquel (24/11/2026), des d'un portàtil"
fase: prova-manual
capa: frontend
regressio: "frontend/src/features/outings/components/LocationField.test.tsx"
commit: "e81fd27c, 70b96541"
llico: cap
etiquetes: [error-testing]
---

# TG-661: els llocs recomanats de la sortida es busquen des del dispositiu

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Al formulari de sortida, a la web des d'un portàtil, el botó «Recomana» no mostrava cap local al centre de Barcelona. La mateixa cerca a Spotwise amb coordenades de Barcelona sí que donava resultats.

## Causa

`RecommendedPlaces` cridava `useDeviceLocation()` i buscava des de la ubicació del dispositiu. A la web, el navegador la treu de la wifi o de la IP i pot caure lluny del lloc on es vol quedar. El criteri 7 de TG-352 i [[contracte-spotwise]] deien «la ubicació de la usuària, no la de l'esdeveniment»: era una decisió del disseny, no un error de codi, i els tests la comprovaven tal com estava escrita. No era l'esperat per a qui crea la sortida: vol locals a prop del lloc que està triant.

## Correcció

`RecommendedPlaces` rep `near`: el lloc ja triat de la sortida o, si no n'hi ha, el centre del mapa en el moment de prémer «Recomana». Ja no demana el permís d'ubicació.

## Test de regressió

`LocationField.test.tsx`, bloc «LocationField recommended places (TG-352, criterion 7; TG-661)»: la cerca usa el lloc triat, el centre del mapa si no n'hi ha, prefereix el lloc triat, no demana la ubicació del dispositiu i no es mou quan es mou el mapa. Primer en vermell (`e81fd27c`), després el canvi (`70b96541`).

## Lliçó

Cap. Era un criteri d'acceptació que no coincidia amb l'ús real, no un test que no comprovés res. La decisió nova queda a [[contracte-spotwise#Integració a Perseida (TG-352)]], [[api#Punts de trobada (TG-352)]] i [[frontend]].
