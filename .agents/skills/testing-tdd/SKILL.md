---
name: testing-tdd
description: Cicle TDD estricte (red-green-refactor) de Perseida per a totes les capes del backend i del frontend - test en vermell en un commit `test:` abans del `feat:`, tests derivats dels criteris d'acceptació, regressió de bugs i llindars de cobertura (80 % global, 90 % codi nou). Usa-la quan implementis o canviïs qualsevol codi de producció, arreglis un bug o hagis de decidir quin test escriure primer.
---

# Testing: TDD estricte

Des del final de l'Sprint 1 el projecte fa **TDD estricte a tot el backend i el frontend** (ADR-0028 al vault, que substitueix ADR-0019). Primer el test en vermell, després el codi mínim que el fa passar, després el refactor.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Convenció de referència: `obsidian_vault/convencions/testing.md`.

> [!note] Estat de les eines
> Ja instal·lades: pytest, pytest-asyncio, pytest-cov, respx (backend); Jest, jest-expo i React Native Testing Library (frontend). La resta d'eines que anomenen les skills `testing-*` (mutmut, Stryker, hypothesis, fast-check, pytest-randomly, pytest-xdist, llindars de cobertura a la CI...) són **previstes (US #359, #361 i #362)**: no les facis servir ni les afegeixis sense preguntar a la persona. Des de TG-360 són **instal·lats** i a la CI schemathesis, import-linter (`uv run lint-imports`), el test de la còpia d'OpenAPI i el de migracions.

## Quan usar-la / quan NO

- Usa-la: tot canvi de codi de producció (feature, bug, refactor amb canvi de comportament), a qualsevol capa.
- NO: tests d'integració amb serveis reals (`testing-integracio`), mutants (`testing-mutation`), propietats (`testing-property-based`); aquestes en complementen el cicle, no el substitueixen.
- Excepció acotada: canvis sense comportament (renom, comentaris, documentació, configuració sense lògica). Si dubtes, aplica el cicle.

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Quin criteri d'acceptació de la US (`TG-NN`) cobreix aquest test? Si el criteri no és verificable (entrada, condició, resultat), pregunta'l abans d'escriure el test.
2. Comportament esperat en un cas límit no definit (buit, màxim, concurrència, extern caigut)? No l'endevinis.
3. Quines dades de prova calen i quines hauries d'inventar? Han de ser sintètiques.
4. Cal una dependència de test nova? Pregunta abans d'afegir-la (versió fixada amb `uv`/`pnpm`).

## El cicle

1. **Tria el criteri** i el nivell més baix de la piràmide que el pot verificar (unitari abans que integració, integració abans que E2E).
2. **ROIG:** escriu el test; executa'l i **comprova que falla pel motiu correcte** (una assertion o l'import d'una API que encara no existeix, no un error de sintaxi ni de configuració). Un test que passa a la primera no demostra res: o el comportament ja existia o el test no comprova res.
3. **Commit `test:`** amb el test en vermell (`TG-NN test(àmbit): resum`). Va **abans** del commit `feat:` o `fix:`.
4. **VERD:** escriu el codi mínim perquè passi. **No toquis el test per fer-lo passar**; si el test era incorrecte, explica per què i canvia'l en un commit a part.
5. **Commit `feat:`/`fix:`** amb el codi (el test ja és al commit anterior).
6. **REFACTOR:** neteja amb els tests en verd (noms, duplicació, complexitat ruff <= 10). Commit `refactor:` sense canvis de comportament.
7. Repeteix per al criteri següent. Cada PR ha de poder ensenyar a l'historial `test:` -> `feat:` -> `refactor:`.

L'ordre dels commits és una regla d'equip documentada a skills, subagents i plantilla de PR; no hi ha cap script que la verifiqui, per això el revisor la comprova a la PR.

## Per capa

| Capa | Primer test | Com |
|---|---|---|
| Domini (entitats, value objects) | `create()` vàlid, cada invariant violat amb el seu `code`, transicions legals i il·legals | Sense mocks ni I/O; factories a `backend/tests/factories/` |
| Services (application) | Camí feliç, cada error, fallada d'un port, no es persisteix a mitges | **Fakes** dels ports a `backend/tests/fakes/`, no mocks fràgils |
| Adaptadors (repositori, client extern) | Roundtrip, restriccions, extern caigut | Integració: skill `testing-integracio` |
| Routers / API | Status, format RFC 9457, 401/403 sense sessió | `httpx.AsyncClient` + `app.dependency_overrides` |
| Hooks (TanStack Query) | loading/èxit/error i `AppError` amb el `code` | RNTL amb `QueryClientProvider` de prova; `jest.mock` del client |
| Components i pantalles | Estats (disabled, loading, empty, error), rols i etiquetes | RNTL amb queries per rol (`getByRole`, `getByLabelText`), hooks amb `jest.mock`, text via `t()` |
| Formularis | Validació (< 100 ms, sense xarxa), mapatge d'`errors` per camp | RNTL |

Patrons i exemples: [references/patrons-per-capa.md](references/patrons-per-capa.md).

## Derivar tests dels criteris

- Un criteri verificable = com a mínim un test; el nom o el docstring porta `TG-NN` i el criteri (traçabilitat).
- Des d'«entrada · condició · resultat»: l'entrada és l'*arrange*, la condició l'*act*, el resultat l'*assert*.
- Cobreix també els límits (mínim, màxim, un més), el camí d'error i el que **no** ha de passar.
- Un test = un comportament. Sense lògica condicional dins del test.

## Bugs: test de regressió primer

1. Reprodueix el bug amb un test que **falla** pel motiu del bug; commit `test:`.
2. Corregeix (commit `fix:`); el test es queda a la suite.
3. Si el bug depèn de l'entorn (BD, hora, xarxa), escriu el test al nivell on es manifesta (vegeu `testing-integracio`).

## Cobertura i qualitat dels tests

- Llindars de la política: **80 % global** i **90 % del codi nou**; la CI de la PR ha de fallar si no es compleixen. La implantació a la CI és **prevista (US #359-#362)**; fins llavors es comproven en local (`uv run pytest` ja porta `--cov`; `pnpm test --coverage`) i els revisa la persona.
- La cobertura és condició necessària, no suficient: els tests han de detectar errors (vegeu `testing-mutation`).
- Piràmide objectiu 60/30/10 (unitàries/integració/E2E).
- Cada PR inclou tests unitaris dels components modificats.
- Components purament visuals (skia, animacions) queden exclosos de cobertura i es verifiquen manualment.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; res assumit en silenci.
- [ ] Cada criteri d'acceptació té test, amb la referència `TG-NN`.
- [ ] Hi ha un commit `test:` en vermell **abans** de cada `feat:`/`fix:`; vist fallar pel motiu correcte.
- [ ] Cap test modificat per fer-lo passar.
- [ ] Tests unitaris de tots els components/mòduls modificats.
- [ ] Test de regressió si és un bug.
- [ ] Cobertura mesurada (80 % global, 90 % codi nou) i resultats reals reportats.
- [ ] `ruff`, `mypy` strict, ESLint i `tsc` nets.
- [ ] Cap secret ni dada personal a tests ni fixtures.

## Què NO fer

- Escriure el codi primer i els tests «després» (ADR-0019, substituïda).
- Tests que passen sempre, assertions buides o snapshots per fer volum de cobertura.
- Mocks de la lògica de domini; mocks fràgils on val un fake.
- Reintents automàtics per «arreglar» un test inestable (vegeu la quarantena a `convencions/testing.md`).
- Afegir dependències de test sense preguntar; fer push, merge o PR.
