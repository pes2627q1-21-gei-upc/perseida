---
name: testing-property-based
description: Tests basats en propietats de Perseida - hypothesis (backend) i fast-check (frontend) per a la lògica crítica del domini (ratxes, puntuació de zones, proximitat, last-write-wins), amb estratègies, invariants i shrinking. Usa-la quan implementis o canviïs un algorisme amb molts casos límit on uns quants exemples fixos no n'hi ha prou.
---

# Testing: basat en propietats

En lloc d'uns quants exemples, descrius una **propietat** que ha de complir-se per a qualsevol entrada vàlida; la llibreria genera centenars de casos i, si en troba un que falla, el redueix (*shrinking*) al cas mínim.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Convenció: `obsidian_vault/convencions/testing.md`.

> [!warning] Eines previstes (US #359-#362)
> `hypothesis` i `fast-check` **no estan instal·lats** al repo. La política els preveu per a la lògica crítica del domini; abans d'usar-los, pregunta a la persona i afegeix-los amb `uv`/`pnpm` i versió fixada (verifica que existeixen i la seva API a la versió instal·lada).

## Quan usar-la / quan NO

Usa-la on hi ha un **algorisme amb invariants** i espai d'entrades gran:

| Àrea (memòria §2.5.2) | Propietats típiques |
|---|---|
| Ràtxes de consulta diària | La ràtxa mai és negativa; consultar el mateix dia dues vegades no la canvia; un dia saltat la reinicia; mai supera el nombre de dies |
| Puntuació de zones d'observació | Resultat dins del rang; monòtona (més núvols, no més puntuació); determinista; permutar l'ordre de les entrades no el canvia |
| Proximitat / filtrat i ordenació | Tot resultat és dins del radi; el resultat és ordenat; la distància és simètrica i `d(a, a) = 0` |
| Last-write-wins (ADR-0011) | Commutativa i idempotent: aplicar les mateixes escriptures en qualsevol ordre dona el mateix estat final |
| Motor de fites | Una fita desbloquejada no es torna a bloquejar; no es desbloqueja dues vegades |

NO: CRUD sense lògica, UI, adaptadors (hi val la integració), ni llocs on les propietats serien una còpia de la implementació. Complementa els exemples del TDD, no els substitueix.

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Quines són les regles de negoci exactes (rangs, fusos horaris, unitats)? No les endevinis: surten de la US i del vault (`arquitectura/model-de-domini.md`).
2. Quin és el domini d'entrades vàlides (límits de les estratègies)?
3. Instal·lem `hypothesis`/`fast-check` ara (versió fixada)?

## Passos

1. Primer, els tests d'exemple del TDD (`testing-tdd`) per als criteris concrets.
2. Escriu la **propietat** en paraules abans del codi («per a qualsevol seqüència de dies, la ràtxa >= 0»).
3. Escriu l'estratègia d'entrades (només vàlides; les invàlides van a un test a part).
4. **ROIG:** executa la propietat contra una implementació que encara no hi és o és incorrecta; commit `test:`.
5. Verd, i refactor. Si hypothesis troba un contraexemple, **afegeix-lo com a test d'exemple** (regressió) i corregeix el codi.

## Hypothesis (backend)

```python
from hypothesis import given, strategies as st

@given(st.lists(st.dates(), unique=True))
def test_streak_never_negative(days):
    """TG-NN: la ràtxa mai és negativa."""
    assert compute_streak(sorted(days)) >= 0
```

- `@given` amb estratègies (`st.integers`, `st.lists`, `st.datetimes`, `st.builds` per a entitats de domini amb `create()`).
- `@settings(max_examples=...)`, `deadline` i `derandomize`: fixa'ls amb la persona perquè la suite sigui estable a la CI.
- `@example(...)` per fixar contraexemples ja trobats.
- Estratègies compartides a `backend/tests/strategies/` (nou; confirma-ho).
- Les propietats del domini no usen mocks ni I/O.

## fast-check (frontend)

Per a lògica pura de presentació (formatació, mapatge de dades, reductors): `fc.assert(fc.property(fc.array(fc.integer()), (xs) => ...))`. La puntuació, els premis i les ratxes viuen al backend: el client només hi aplica propietats de presentació (p. ex. un format mai llança excepció).

## Estratègies i shrinking: bones pràctiques

- Genera només entrades **vàlides** pel domini (construeix-les amb `st.builds` / `create()`); si has de filtrar molt (`.filter`), redissenya l'estratègia.
- Propietats que no repeteixin la implementació: invariants, idempotència, commutativitat, simetria, relació amb un model més simple (oracle).
- El *shrinking* només és útil si l'estratègia es redueix bé: prefereix `st.integers(min_value=...)` a funcions arbitràries.
- Reproduïbilitat: la llibreria desa la llavor del cas fallit; copia'l com a `@example`/test d'exemple.
- No dependre del temps real ni de l'ordre.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; llibreria instal·lada amb versió fixada (o pendent anotat).
- [ ] Cada propietat escrita en paraules i amb `TG-NN`.
- [ ] Estratègies només amb entrades vàlides.
- [ ] Propietat vista fallar abans de la implementació (commit `test:`).
- [ ] Contraexemples trobats convertits en tests d'exemple.
- [ ] `max_examples`/`deadline` fixats; suite estable i ràpida.

## Què NO fer

- Propietats que reimplementen el codi sota prova.
- Estratègies que generen entrades invàlides barrejades amb les vàlides.
- Substituir els tests d'exemple dels criteris d'acceptació.
- Afegir `hypothesis`/`fast-check` sense preguntar; fer push, merge o PR.
