---
titol: "Sessió 2026-10-22: NASA_API_KEY a infra/ i revisió de les PR #40 i #42"
tipus: sessio
estat: vigent
data: "2026-10-22"
us: ["TG-46", "TG-38", "TG-143"]
font: "PR #40, #42 i #43 de GitHub; tasca TG-143 de Taiga; infra/.env.example, .github/workflows/cd.yml, infra/scripts/deploy.sh"
etiquetes: [sessio, infra, cd, revisio, tg-46, tg-38, tg-143]
---

# Sessió 2026-10-22 · `NASA_API_KEY` a `infra/` i revisió de les PR #40 i #42

## Objectiu

Després de fusionar TG-46 (#41), revisar les PR obertes de l'equip i comprovar que TG-46 no hagués deixat cap variable sense propagar.

## Què s'ha fet

- **PR #43 (TG-46):** `NASA_API_KEY` a `infra/.env.example`, a la taula de variables dels README d'`infra/` (en/ca/es) i a la configuració de [[api]].
  - TG-46 només l'havia posada a l'`.env.example` de l'arrel i a `backend/`. Sense la PR, la pila de Docker Compose no arrencava, i amb la #40 tampoc el CD.
  - S'ha comprovat que #43 es fusiona sense conflictes amb #40.
- **Revisió de la PR #40 (TG-38, CD per SSH):** canvis demanats. El CD és sòlid en seguretat, però fusionat amb el `develop` actual hi ha tres problemes:
  - el test de rendiment de l'APOD encara posa `GOOGLE_CLIENT_ID` (la PR el canvia a `GOOGLE_CLIENT_IDS`);
  - falta `NASA_API_KEY` a `ENV_SECRET_ONLY` i a la taula de secrets del CD;
  - la sonda del rollback de `deploy.sh` fa `alembic downgrade` quan la versió nova necessita una variable que l'anterior no fa servir.
- **Revisió de la PR #42 (TG-143, Redis al Compose):** canvis demanats.
  - El canvi és correcte, però té un conflicte amb `develop` a [[redis]], provocat per TG-46.
  - «Què canvia» de la descripció és buida.
  - El camp `data` de [[redis]] i la nota de sessió no estan actualitzats.
- **Comprovació de les altres US de la persona:**
  - només TG-46 i TG-118 tocaven configuració;
  - `EXPO_PUBLIC_API_BASE_URL` (TG-118) només és a `frontend/.env.example`, i és correcte, perquè el CD no desplega el frontend.

## Decisions preses

- **`NASA_API_KEY` és un secret del repositori,** no de l'entorn `production`. El job `verify-config` del CD no té entorn i només veu els secrets del repositori.
- **El canvi a [[api]] va en una línia a part** i sense tocar `data`, perquè no entri en conflicte amb la #40, que edita la mateixa línia de variables.

> [!warning] Rollback que esborra dades (PR #40)
> Si una versió nova exigeix una variable que falta al `.env`, la sonda de `deploy.sh` arrenca bé la imatge anterior, conclou que el fallo és del codi i desfà les migracions. Això contradiu l'ADR-0025 («la sonda evita el downgrade quan la causa és la configuració»). Sense la #43, el primer CD a `main` hauria esborrat la taula `apod`.

## Canvis al vault

- Aquesta nota.
- [[api]]: `NASA_API_KEY` i els timeouts de la NASA a la configuració (PR #43).

## Pendent / següents passos

- [ ] Aprovar i fusionar la #43 (la persona). Va abans que la #40.
- [ ] #40 (Oriol): incorporar `develop` després de la #43, corregir el test, completar `NASA_API_KEY` al CD i resoldre el cas de la sonda.
- [ ] #42 (Oriol): resoldre el conflicte de [[redis]], omplir «Què canvia» i actualitzar el vault.
- [ ] Crear el secret `GOOGLE_CLIENT_ID` a GitHub (ara hi ha `GOOGLE_CLIENT_IDS`) o fusionar la #40, que canvia el nom. Si no, el CD a `main` falla.

### Punts oberts (sense implementar)

- L'ADR-0025 és «proposada» i dona cobertura a un rollback destructiu: cal decidir si s'accepta abans de fusionar la #40.
- Els tests d'`infra/scripts/` no s'executen a la CI.
- La variable `REDIS_HOST` de GitHub probablement val `redis` (àlies) i no `cache`.

## US de Taiga

- TG-46
- TG-38
- TG-143
