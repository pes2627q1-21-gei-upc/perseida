---
titol: "Sessió 2026-11-09: quiz diari al backend (TG-60)"
tipus: sessio
estat: vigent
data: "2026-11-09"
us: ["TG-60", "TG-61"]
font: "Taiga US #60 i tasques #522-#535; decisions de l'equip al xat del grup (09/11/2026); backend/app/*/quiz, backend/alembic"
etiquetes: [sessio, backend, quiz, gamificacio, redis, postgres]
---

# Sessió 2026-11-09 · Quiz diari al backend (TG-60)

## Objectiu

Implementar la generació del quiz diari en català, castellà i anglès amb cache a Redis, i deixar el contracte publicat per a la pantalla (TG-61).

## Què s'ha fet

- **Contracte** a [[contracte-quiz]] i tres codis nous al catàleg d'errors: `QUIZ_ALREADY_ANSWERED`, `QUIZ_EXPIRED` i `QUIZ_QUESTION_MISMATCH`.
- **Banc de 100 preguntes** (`backend/alembic/seed/quiz_questions.json`) en tres idiomes, cadascuna amb una font fiable comprovada (NASA, ESA, UAI, ESO, Planetary Society).
- **Domini** (`app/domain/quiz`): models, rotació per data, regles de caducitat i de pregunta del dia, i ports.
- **Persistència**: taules, migració de les taules i migració *seed* del banc, i repositoris. La restricció única evita dues respostes el mateix dia, també en paral·lel.
- **`QuizService`** amb cache a Redis fins a mitjanit UTC i retorn a PostgreSQL si Redis cau.
- **Endpoints** `GET /api/quiz/today` i `POST /api/quiz/today/answer`, OpenAPI i tipus del frontend regenerats.
- TDD: cada part amb el commit `test:` abans del `feat:`.

## Decisions preses

- **Una pregunta al dia, banc propi a PostgreSQL i cache a Redis:** acordat amb l'equip (Oriol) al xat del grup el 9/11.
- **`lang` opcional:** sense paràmetre, s'usa l'idioma preferit de l'usuari.
- **Dia en UTC**, com l'APOD: a Catalunya la pregunta canvia a la 1:00 o a les 2:00.
- **Rotació en ordre** des de `ROTATION_START` (1/1/2026): sense repeticions en 100 dies. Afegir preguntes demana una migració de dades nova.
- **Fuzzing:** un cos il·legible al `POST` responia 400 no documentat; ara és a l'OpenAPI. El 409 i el 422 amb dades vàlides s'accepten al check `positive_data_acceptance` d'aquella operació.

## Canvis al vault

- [[contracte-quiz]] (nova), [[model-de-domini]], [[api]], [[00-index]] i el catàleg d'errors de la skill `gestio-errors`.

## Pendent / següents passos

- [ ] Pantalla del quiz (TG-61) sobre aquest contracte.
- [ ] Textos `errors.QUIZ_*` al frontend (TG-61).
- [ ] Revisió de la PR.

> [!tip] PostgreSQL en local amb Apple Silicon
> La imatge `postgis/postgis:18-3.6` no té versió arm64: cal `docker run --platform linux/amd64 …`. Si ja hi ha un PostgreSQL local al port 5432, publica el de Docker a un altre port (p. ex. `-p 5433:5432`) i posa `POSTGRES_PORT=5433` al `backend/.env`.

## US de Taiga

- TG-60
