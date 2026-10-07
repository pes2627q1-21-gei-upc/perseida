---
titol: "Estratègia de proves"
tipus: convencio
estat: vigent
data: "2026-10-07"
us: ["TG-85"]
font: "memòria §2.5, §2.9.3"
etiquetes: [convencio, testing, tdd, cobertura, nfr]
---

# Estratègia de proves

## Regla

Les proves segueixen la piràmide: base àmplia de proves unitàries, un nombre moderat d'integració i, al cim, les d'acceptació. Cap US arriba a Done sense les seves proves.

## Nivells

| Nivell | Proporció objectiu | Eines |
|---|---|---|
| Unitàries | ≈ 70 % dels tests | Backend: pytest, pytest-asyncio, pytest-xdist. Frontend: Jest i React Native Testing Library |
| Integració | ≈ 30 % dels tests | httpx.AsyncClient, respx, PostgreSQL/PostGIS i Redis en contenidors efímers |
| Acceptació | 100 % dels criteris verificats (automàtic o manual); ≥ 80 % amb test automatitzat | Tests automatitzats; la resta, llista de comprovació manual sobre la branca `release/*` |

No s'automatitzen proves end-to-end sobre l'app mòbil.

## Proves d'acceptació

- **Regla general:** cada criteri d'acceptació d'una US té almenys un test automatitzat, unitari o d'integració, i el test es nomena amb la referència de la US que valida (traçabilitat criteri-prova).
- **Excepció:** els criteris que depenen de la interfície i no es poden automatitzar a nivell de component es verifiquen manualment, amb una llista de comprovació sobre la branca `release/*` abans de la sprint review.
- **Objectiu mesurable:** 100 % dels criteris verificats (de manera automàtica o manual) i ≥ 80 % amb test automatitzat.

> [!note] Lectura combinada de la memòria
> La memòria (§2.5.3) ho expressa en dos llocs: la taula de nivells («100 % verificats; ≥ 80 % amb test automatitzat») i el paràgraf «Proves d'acceptació» («cada criteri té almenys un test automatitzat»). Aquesta nota en recull la lectura combinada: l'automatització és la norma, la verificació manual és l'excepció acotada i els percentatges són l'objectiu mesurable. No cal tornar-ho a debatre.

## TDD al domini

Es fa TDD sistemàtic a la capa de domini del backend (cicle red–green–refactor), derivant el test d'un criteri d'acceptació. El test en vermell es puja en un commit propi abans del commit que el fa passar. A la resta de capes no hi ha TDD estricte, però les proves s'escriuen dins la mateixa tasca i abans d'obrir la PR. Davant d'un bug, primer s'escriu un test que el reprodueix i falla; queda a la suite com a test de regressió.

## Jocs de prova

- `backend/tests/fixtures/`: respostes enregistrades de les APIs de la NASA i de meteorologia (JSON) i punts d'observació d'exemple.
- `backend/tests/factories/`: generadors d'usuaris, esdeveniments, missatges i fites.
- `backend/tests/moderation_dataset/`: joc etiquetat per avaluar Kev-4B en català, castellà i anglès.
- `frontend/__mocks__/`: respostes simulades de l'API.

## Cobertura

| Component | Cobertura mínima |
|---|---|
| Backend: domini | ≥ 80 % |
| Backend: aplicació (casos d'ús) | ≥ 70 % |
| Backend: infraestructura (adaptadors i API) | ≥ 50 % |
| Backend: global | ≥ 70 % |
| Frontend: hooks i lògica de presentació | ≥ 70 % |
| Frontend: components purament visuals | Exclosos |
| Codi nou de cada PR | ≥ 70 % |

Només el llindar del codi nou es fa complir automàticament (Quality Gate, vegeu [[qualitat]]); la resta són objectius revisats a cada retrospectiva. Es mesura amb `pytest-cov` i `jest --coverage`.

## Requisits no funcionals mesurables

| Requisit | Llindar | Verificació |
|---|---|---|
| Recursos servits des de Redis (APOD) | ≤ 200 ms | Integració amb pytest i httpx |
| Consultes geoespacials de proximitat | ≤ 150 ms | Integració sobre PostgreSQL/PostGIS |
| Endpoints privats sense sessió vàlida | 100 % rebutgen (401/403) | Integració de l'API |
| Validació de formularis | Feedback a la UI < 100 ms sense crida a xarxa | Jest i React Native Testing Library |
| Caiguda d'APIs externes | Dades de la cau, sense HTTP 500 | Integració amb respx |
| Seguretat i maduresa del codi nou | 0 secrets exposats, 0 bugs i 0 vulnerabilitats noves, qualificació A | Quality Gate |

Els tests de temps prenen la mediana de diverses peticions consecutives.

## Execució

En local: `uv run pytest` (backend) i `pnpm test` (frontend), o Docker Compose. A la CI, GitHub Actions executa els tests a cada PR cap a `develop` o `main`, amb filtres per ruta i memòria cau de dependències.

## Enllaços

- [[qualitat]]: Quality Gate i anàlisi estàtica.
- [[definition-of-done]]: proves com a part de la DoD.
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
