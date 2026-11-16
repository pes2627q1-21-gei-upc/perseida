---
titol: Catàleg de fites (esborrany)
tipus: producte
estat: esborrany
data: 2026-11-16
us: ["TG-58"]
font: "not-list (YES), tasca TG-58 #627"
etiquetes: [producte, fites, gamificacio]
---

# Catàleg de fites (esborrany)

Llista de fites que podria tenir Perseida, pensada per al motor de [[epiques-i-us|TG-58]]. Cada fita és una fila del catàleg amb un `kind` (tipus d'activitat) i un `threshold` (llindar). Surt només de les funcionalitats del **YES** de la [[not-list]].

> [!warning] Esborrany per revisar
> Els noms, els textos i els llindars són una proposta. Cal que la persona i l'equip els validin abans de carregar-los al catàleg.

> [!tip] Regla dels noms
> Només la fita màxima de **Ratxes** es diu **Perseida** (365 dies seguits, un any com la pluja d'estels). La resta de noms tenen a veure amb l'astronomia.

> [!info] Escala dels llindars
> Les activitats que es poden repetir molt (quizzes, partides guanyades, seguidors) pugen en graons de **1 → 10 → 50 → 100**. Les que són més rares (subscripcions a esdeveniments i fites compartides) s'aturen abans: **1 → 10 → 25 → 50** i **1 → 10 → 25**. Les ratxes van en dies (1, 7, 14, 30, 100, 365), perquè el temps és el seu propi graó.

## Com llegir la taula

- **inicial:** és una de les fites que demana la US TG-58 i es carrega al catàleg des del primer dia.
- **proposta:** no surt de la US; és una idea nova i l'equip ha de decidir si entra al catàleg.
- **depèn:** la fita es pot carregar, però no es desbloqueja fins que una altra US (quiz, subscripcions, xat, minijoc...) enviï l'activitat a l'app.
- **tipus nou:** el motor encara no sap detectar aquesta activitat; cal afegir un `kind` nou (una línia de codi), no només una fila.

## Ratxes (imatge diària (APOD, TG-58), TG-56)

| Nom | Condició | Estat |
|---|---|---|
| Primera llum | `streak_days` = 1 | inicial |
| Òrbita setmanal | `streak_days` ≥ 7 | inicial |
| Lluna plena | `streak_days` ≥ 14 | proposta |
| Cicle lunar | `streak_days` ≥ 30 | proposta |
| Estrella fixa | `streak_days` ≥ 100 | proposta |
| **Perseida** | `streak_days` ≥ 365 | proposta |

## Quiz diari (TG-61)

| Nom | Condició | Estat |
|---|---|---|
| Telescopi nou | `quiz_completed` = 1 | inicial, depèn |
| Cel clar | `quiz_perfect` ≥ 1 (totes les respostes bones) | proposta, depèn, tipus nou |
| Astrònom aprenent | `quiz_completed` ≥ 10 | proposta, depèn |
| Cartògraf celeste | `quiz_completed` ≥ 50 | proposta, depèn |
| Astrofísic | `quiz_completed` ≥ 100 | proposta, depèn |

## Esdeveniments (TG-53)

| Nom | Condició | Estat |
|---|---|---|
| Primera alineació | `event_subscription` = 1 | inicial, depèn |
| Caçador d'eclipsis | `event_subscription` ≥ 10 | proposta, depèn |
| Col·leccionista d'aurores | `event_subscription` ≥ 25 | proposta, depèn |
| Efemèrides | `event_exported` ≥ 1 (exportar un esdeveniment al calendari) | proposta, depèn, tipus nou |
| Calendari celeste | `event_exported` ≥ 10 (exportar un esdeveniment al calendari) | proposta, depèn, tipus nou |
| Eclipsi total | `event_subscription` ≥ 50 | proposta, depèn |

## Social (seguiment i xat)

| Nom | Condició | Estat |
|---|---|---|
| Satèl·lit | `followers` = 1 | proposta, depèn, tipus nou |
| Òrbita compartida | `following` = 1 | proposta, depèn, tipus nou |
| Senyal de ràdio | `message_sent` = 1 | proposta, depèn, tipus nou |
| Cúmul estel·lar | `followers` ≥ 100 | proposta, depèn, tipus nou |
| Galàxia | `followers` ≥ 500 | proposta, depèn, tipus nou |
| Estrella polar | `followers` ≥ 1000 | proposta, depèn, tipus nou |
| Primer senyal | `achievement_shared` ≥ 1 | proposta, depèn (TG-59), tipus nou |
| Postal de l'espai | `achievement_shared` ≥ 10 | proposta, depèn (TG-59), tipus nou |
| Ambaixador del cosmos | `achievement_shared` ≥ 25 | proposta, depèn (TG-59), tipus nou |

## Minijoc

| Nom | Condició | Estat |
|---|---|---|
| Llançament | `minigame_played` ≥ 1 | proposta, depèn, tipus nou |
| Missió complerta | `minigame_won` ≥ 1 | proposta, depèn, tipus nou |
| Rècord orbital | `minigame_record_beaten` ≥ 1 (superar el teu rècord personal) | proposta, depèn, tipus nou |
| Rècord galàctic | `minigame_record_beaten` ≥ 10 (superar el teu rècord personal) | proposta, depèn, tipus nou |
| Repte llençat | `minigame_challenge_sent` ≥ 1 (reptar un amic per primer cop) | proposta, depèn, tipus nou |
| Comandant | `minigame_won` ≥ 10 | proposta, depèn, tipus nou |
| Gran mestre estel·lar | `minigame_won` ≥ 50 | proposta, depèn, tipus nou |
| Llegenda còsmica | `minigame_won` ≥ 100 | proposta, depèn, tipus nou |

## Decisions que cal prendre

- Quines de les «proposta» entren al catàleg inicial.
- Quins `kind` nous accepta el motor ara i quins esperen les seves US.
- Si es volen fites ocultes (sorpresa) o només visibles.

## Enllaços

- [[not-list]]
- [[epiques-i-us]]
- [[model-de-domini]]
