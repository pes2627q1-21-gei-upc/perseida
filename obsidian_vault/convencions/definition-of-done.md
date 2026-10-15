---
titol: "Definition of Ready i Definition of Done"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.1, §2.4.3"
etiquetes: [convencio, dod, dor, scrum, taiga]
---

# Definition of Ready i Definition of Done

## Regla

La Definition of Done (DoD) és única i comuna a totes les US; s'hi afegeixen els criteris d'acceptació, que són propis de cada història. Una US només passa a Done si compleix tots els punts següents.

## Definition of Done

- Compleix els seus criteris d'acceptació.
- Totes les seves subtasques estan tancades.
- El codi s'ha integrat a `develop` mitjançant una PR que ha superat les comprovacions automàtiques (linters, comprovació de tipus, tests i Quality Gate de SonarQube Cloud, que exigeix cobertura sobre el codi nou; cap US arriba a Done sense les seves proves).
- La PR ha estat revisada i aprovada per una persona diferent de les que l'han desenvolupada.
- Si la US canvia l'arquitectura o pren una decisió rellevant, el vault d'Obsidian s'ha actualitzat (abans de fusionar la PR). Vegeu [[actualitzacio-del-vault]].

## Definition of Ready

Una US passa a Ready a Taiga quan: està redactada amb el format «Com a [rol] vull [funcionalitat] per a [benefici]», té criteris d'acceptació i ha estat descomposta en subtasques. A més, els criteris han de ser verificables (entrada, condició i resultat esperat) perquè cadascun es pugui traduir en un cas de prova.

## Estats

Subtasques:

| Estat | Significat |
|---|---|
| NEW | Existeix, encara no s'ha començat. |
| IN PROGRESS | Algú hi treballa activament. |
| READY FOR TEST | Desenvolupada; espera que una altra persona en revisi la PR. Si es fusiona passa a CLOSED; si es rebutja, torna a IN PROGRESS. |
| CLOSED | Completada i integrada. |
| NEEDS INFO | No es pot avançar fins que s'aclareixi algun aspecte. |

US (no unificats amb els de les tasques): New, Ready, In progress, Ready for test, Done i Archived. Archived vol dir que es deixa de banda de moment.

## Com es comprova

- Inici de la US: es comprova la DoR.
- Obertura de la PR: la plantilla de PR (`.github/pull_request_template.md`) porta la llista de comprovació que valida el revisor, incloent-hi l'actualització del vault.
- Tancament de la US: es comprova la DoD.
- Sempre que sigui possible, la PR s'enllaça a la tasca o US de Taiga.

## Enllaços

- [[actualitzacio-del-vault]]: quan i com es compleix el criteri del vault.
- [[assistents-ia]]: el codi generat amb IA passa per la mateixa DoD.
- [[gitflow]]: model de branques i protecció.
- [[qualitat]] i [[testing]]: portes de qualitat i proves que formen part de la DoD.
