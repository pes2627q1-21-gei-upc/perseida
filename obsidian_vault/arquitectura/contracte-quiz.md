---
titol: "Contracte del quiz diari"
tipus: arquitectura
estat: vigent
data: "2026-11-09"
us: ["TG-60", "TG-61"]
font: "Taiga: TG-60 (criteris i decisions de l'equip del 9/11/2026) i tasca TG-523; backend/app/infrastructure/apod/router.py i users/router.py com a referència"
etiquetes: [arquitectura, contracte, quiz, gamificacio, api]
---

# Contracte del quiz diari

Forma dels dos endpoints del quiz diari (TG-60). Es publica a la tasca TG-523 perquè la pantalla (TG-61) es pugui fer amb mocks abans que el backend estigui fusionat.

- **Una pregunta al dia**, la mateixa per a tothom i en l'idioma de la persona. El dia es calcula en UTC, com l'APOD.
- **Autenticació:** els dos endpoints demanen una sessió vàlida (`Authorization: Bearer <access token>`).
- **Idioma:** paràmetre `lang` (`ca`, `es` o `en`). Si no s'envia, s'usa l'idioma preferit de la persona (`preferred_language` de `GET /api/users/me`).

## `GET /api/quiz/today`

Retorna la pregunta del dia. Mai inclou la resposta correcta, l'explicació ni la font, llevat que la persona ja hagi respost.

```json
{
  "date": "2026-11-09",
  "question_id": "01a19288-a3f6-7576-a37b-8926ca81b8fe",
  "language": "ca",
  "statement": "Quin és el planeta més calent del sistema solar?",
  "options": ["Mercuri", "Venus", "Mart", "Júpiter"],
  "result": null
}
```

Si la persona ja ha respost avui, `result` té la mateixa forma que la resposta del `POST`.

## `POST /api/quiz/today/answer`

Desa la resposta i retorna el resultat. `lang` com al `GET`, per a l'idioma de l'explicació.

Cos de la petició:

```json
{
  "date": "2026-11-09",
  "question_id": "01a19288-a3f6-7576-a37b-8926ca81b8fe",
  "chosen_option": 1
}
```

Resposta `201 Created`:

```json
{
  "chosen_option": 1,
  "correct": true,
  "correct_option": 1,
  "explanation": "Venus, tot i que Mercuri és més a prop del Sol. …",
  "source_url": "https://science.nasa.gov/venus/facts",
  "answered_at": "2026-11-09T12:34:56Z"
}
```

## Camps

Tots els camps hi són sempre: els opcionals valen `null`, mai s'ometen.

| Camp | Tipus | Regles |
|---|---|---|
| `date` | data (`YYYY-MM-DD`) | Dia UTC de la pregunta |
| `question_id` | UUID | UUIDv7 ([[0023-convencions-del-model-de-dades]]); igual en tots els idiomes |
| `language` | `ca` \| `es` \| `en` | Idioma dels textos retornats |
| `statement` | text | No buit |
| `options` | llista de 4 textos | Sempre 4, en un ordre fix per a cada pregunta |
| `result` | objecte o `null` | `null` si encara no s'ha respost avui |
| `chosen_option` | enter 0-3 | Posició de l'opció triada a `options` |
| `correct` | booleà | Si `chosen_option` és la correcta |
| `correct_option` | enter 0-3 | Posició de l'opció correcta |
| `explanation` | text | Una o dues frases, en l'idioma demanat |
| `source_url` | text | Només `https`; font fiable que confirma la resposta |
| `answered_at` | data i hora | ISO 8601 en UTC (`Z`) |

## Errors

Format RFC 9457 ([[0018-errors-rfc-9457-amb-codis-estables]]). El frontend tradueix pel `code`.

| Status | Code | Quan |
|---|---|---|
| 401 | `INVALID_SESSION` | Sense sessió vàlida (codi existent) |
| 409 | `QUIZ_ALREADY_ANSWERED` | La persona ja ha respost la pregunta d'avui |
| 409 | `QUIZ_EXPIRED` | La `date` del `POST` no és la d'avui (UTC) |
| 422 | `QUIZ_QUESTION_MISMATCH` | El `question_id` no és el de la pregunta del dia |
| 422 | `VALIDATION_ERROR` | `lang` no suportat, `chosen_option` fora de 0-3 o cos mal format (codi existent) |

## Regla de canvis

> [!warning] Canvis del contracte
> Un canvi d'aquest esquema afecta la TG-61: s'han d'actualitzar els exemples, aquesta nota i la còpia de l'OpenAPI del frontend a la mateixa PR.

## Enllaços

- [[model-de-domini]], [[api]], [[0005-redis-nomes-com-a-cache-lazy]], [[0018-errors-rfc-9457-amb-codis-estables]]
