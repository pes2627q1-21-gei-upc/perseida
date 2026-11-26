---
titol: "Sessió 2026-11-26: resposta a la review de la PR 156 (TG-77, PR 4 de 4)"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-77"]
font: "PR #156 (review de CHANGES_REQUESTED); codi a .github/workflows/cd.yml i infra/README*.md"
etiquetes: [sessio, infra, cd, review]
---

# Sessió 2026-11-26 · Resposta a la review de la PR 156

## Objectiu

Atendre la review de la PR 156 (publicació del panell pel CD, quarta PR de TG-77): un bloquejant i dues preguntes de disseny.

## Què s'ha fet

- **Bloquejant, verificat al codi:** `admin-bundle` llegia `vars.EXPO_PUBLIC_API_BASE_URL` i `vars.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, que viuen a l'environment `android-release` (`android-release.yml` declara `environment: android-release`). `admin-bundle` no declarava cap `environment:`, així que el pas de comprovació fallava i, per `needs: admin-bundle`, cap desplegament a `main` arribava al servidor. Ara declara `environment: production` i el missatge d'error ho diu.
- **Ordre dels passos:** «Baixar el paquet del panell» i «Publicar el panell d'administració» van ara després de «Recarregar nginx-proxy-manager». Si la publicació falla, la configuració de TG-351 ja s'ha aplicat.
- **README d'`infra/`** (ca, es i en): l'origen de les variables i el nou ordre.

## Decisions preses

Cap ADR nova.

- **Variables del panell a `production`:** duplicades a l'environment `production` en lloc de compartir-les amb l'APK. No depenen de les proteccions de `android-release` (que només accepta `main` i pot tenir revisors) ni obliguen a tocar `android-release.yml`, fora de l'abast de la PR.
- **`deploy` continua depenent d'`admin-bundle`:** una API nova amb un panell vell o absent seria incoherent. Es mitiga amb el nou ordre, que evita l'estat a mitges.

## Canvis al vault

- [[nginx-proxy-manager]]: el CD publica el panell després de `deploy.sh` i de recarregar el proxy.

## Pendent / següents passos

- [ ] Crear `EXPO_PUBLIC_API_BASE_URL` i `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` com a variables de l'environment `production` (Settings, Environments). Cal permís d'administració del repo. Sense això, el CD falla.
- [ ] Commit i push de la persona; respondre la review (resposta redactada a la conversa, no enviada).
- [ ] No s'ha pogut passar `actionlint` (no instal·lat); el CD només corre a `main`, així que no s'ha provat de cap a cap.

## US de Taiga

- TG-77
