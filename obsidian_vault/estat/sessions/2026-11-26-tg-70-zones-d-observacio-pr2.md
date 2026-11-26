---
titol: "Sessió 2026-11-26: càrrega inicial de zones d'observació, PR 2 (TG-70)"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-70"]
font: "Taiga TG-70 (subtasques #497 i #660); codi a backend/app/infrastructure/observation_zones"
etiquetes: [sessio, backend, postgis, zones]
---

# Sessió 2026-11-26 · Zones d'observació (TG-70, PR 2 de 2)

## Objectiu

Criteri 5: una càrrega inicial de zones d'observació, amb la font documentada al vault.

## Què s'ha fet

- **`zones.json`** amb 9 zones de Catalunya i l'`source_url` de cada una (ca.wikipedia, CC BY-SA).
- **`load_zones.py`:** `read_zones` (valida amb el domini) i `load_zones` (`ON CONFLICT (id) DO UPDATE`), executable amb `python -m`.
- **`entrypoint.sh`:** executa el carregador després d'`alembic upgrade head`, dins del bloc `RUN_MIGRATIONS`.
- **TDD (ADR-0028):** tests en vermell (`84d57687`) abans del `feat:` (`daec8626`). Un test ajustat (`798f97d6`): `Location` llança el `ValidationError` de Pydantic, no un `DomainError`.
- **Vault:** [[postgres]], secció «Zones d'observació: càrrega inicial».

## Decisions preses

Cap ADR nova.

- **Fitxer editable + carregador idempotent a cada arrencada** (decisió de Raquel, 26/11/2026), en lloc de la migració de seed del pla inicial: una migració només s'executa una vegada i les zones afegides més endavant al JSON no arribarien a la BD.
- **Les 9 zones proposades hi van totes** i la llista és curada a mà (decisions de Raquel, 25 i 26/11/2026).
- **Treure una entrada del JSON no esborra la zona de la BD**, a propòsit.

## Pendent / següents passos

- [ ] Comentari a Taiga TG-70 explicant la desviació (carregador en lloc de migració), i #497, #660 i #500 a Ready for test (cal confirmació).
- [ ] Apilar (`gh stack`), push i PR només quan Raquel ho demani.
