---
titol: "Convencions del model de dades i taules d'usuari"
tipus: adr
estat: acceptada
data: "2026-10-21"
us: ["TG-45", "TG-135"]
font: "sessió de treball del 2026-10-21 (TG-135); decisió de la persona responsable"
etiquetes: [adr, backend, postgres, model-de-dades, migracions]
---

# ADR-0023 · Convencions del model de dades i taules d'usuari

## Context

TG-135 crea les primeres taules d'aplicació (`users` i `user_identities`) i, per tant, fixa el precedent per a totes les que vindran (seguiments, xat, gamificació, denúncies, sancions…). El vault no tenia cap regla sobre el tipus de clau primària, els enums ni les marques de temps. Requisits de la persona responsable: com a mínim **BCNF**, soft delete d'usuaris i que l'`email` no sigui mai clau primària (podria canviar).

## Decisió

- **Normalització:** tot esquema com a mínim en BCNF; tot determinant funcional és clau candidata.
- **Clau primària:** identificador intern `uuid` **UUIDv7** (`uuidv7()` de PostgreSQL 18 per defecte i `uuid.uuid7()` al domini). Mai un atribut de negoci (email, `google_sub`).
- **Identitat externa en taula pròpia:** `user_identities(provider, subject)` amb PK composta i FK a `users.id`. `UNIQUE (user_id, provider)`. La FK és `ON DELETE RESTRICT`: un `DELETE` físic no pot alliberar el `google_sub` d'un compte esborrat; una purga futura haurà d'esborrar la identitat de forma explícita. Per ara només `google`; un altre proveïdor no canvia `users`.
- **Valors tancats** (rol, idioma, estat, proveïdor): `VARCHAR` + `CHECK` amb nom (convenció `ck_`), no `ENUM` de PostgreSQL ni taules lookup. Afegir un valor és una migració trivial.
- **Marques de temps:** `timestamptz`, en UTC, amb `server_default now()`.
- **Soft delete d'usuaris:** `users.deleted_at` (nul = actiu). L'estat d'esborrat **no** es duplica a `status` (`active`/`suspended`/`banned`). `email` i `google_sub` segueixen únics també per als esborrats, de manera que un compte esborrat no es pot tornar a crear.
- **Email:** únic i guardat en minúscules (`CHECK email = lower(email)`); és un atribut, no clau de cap FK.
- **Sancions:** `users.status` és només l'estat actual; l'historial (motiu, durada, qui) serà una taula pròpia a les US de moderació.
- **Domini ≠ taules:** l'entitat `User` del domini no ha de coincidir amb les taules (p. ex. `google_sub` viu a `user_identities`); el repositori fa el mapeig ([[0016-ports-i-entitats-riques-al-domini]]).
- **Alembic:** `env.py` ignora les taules que pertanyen a una extensió (PostGIS) perquè l'*autogenerate* no proposi esborrar-les.

## Conseqüències

### Positives

- Esquema sense anomalies d'actualització; canviar l'email o afegir un proveïdor no toca claus.
- UUIDv7 és ordenable per temps (bons índexs) i no revela el nombre d'usuaris.
- `alembic check` queda net en una base amb PostGIS.

### Negatives (assumides)

- `uuidv7()` com a valor per defecte requereix PostgreSQL 18 o superior (és la versió de l'ADR-0006 i del CI).
- Una consulta d'usuari per `google_sub` necessita un `JOIN` amb `user_identities`.
- Les dades personals (email, nom) d'un compte esborrat es conserven; no hi ha cap US d'anonimització, caldrà una si és necessària.
- Per aplicar la convenció de noms de restriccions, `app/infrastructure/persistence/models.py` s'ha d'importar abans que les taules (ho fa `env.py`).

## Alternatives descartades

- `google_sub` com a columna de `users`: més simple, però lliga el model a un sol proveïdor.
- `ENUM` de PostgreSQL: `ALTER TYPE` és incòmode i no deixa treure valors.
- Taules lookup per a rol/idioma/estat: més taules i *seeds* sense atributs que ho justifiquin.
- `email` com a PK, o `deleted` com a valor de `status`: la primera impedeix canviar l'email; la segona és redundant amb `deleted_at`.

## US de Taiga relacionades

- TG-45 (model d'usuari, alta automàtica i logout), tasca TG-135

## Enllaços

- [[model-de-domini]]
- [[postgres]]
- [[0006-postgresql-postgis-font-de-veritat]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
