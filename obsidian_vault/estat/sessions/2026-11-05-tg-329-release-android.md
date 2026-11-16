---
titol: "Sessió 2026-11-05: workflow de release d'Android (TG-329)"
tipus: sessio
estat: vigent
data: "2026-11-05"
us: ["TG-329", "TG-334", "TG-335", "TG-336", "TG-337"]
font: "US TG-329 de Taiga (tasques #334-#337); frontend/plugins/withAndroidRelease.js; execucions d'android-release.yml del 28/10/2026 a main"
etiquetes: [sessio, android, release, ci, tg-329]
---

# Sessió 2026-11-05 · Workflow de release d'Android (TG-329)

## Objectiu

Portar a `develop` el workflow de release de l'APK, complint els criteris de la US, i documentar-lo.

## Què s'ha fet

- `android-release.yml` nou a partir de `develop`, amb entrades `version` i `publish`, jobs `build` i `release` separats, actions fixades per SHA, comprovació que el tag és a `main` i verificació de la signatura i de la versió.
- `withAndroidRelease` aplica `versionName` i `versionCode` des de l'entorn, amb tests.
- [[0029-apk-android-a-github-releases-amb-obtainium]], [[instal-lar-app-android]] i els README d'`infra/` i `frontend/`.

## Decisions preses

- **Gradle 9.4.1**, no ≥ 9.8.1 com demanava la tasca #334: vegeu [[0029-apk-android-a-github-releases-amb-obtainium]]. El mateix motiu descarta la branca `feature/TG-334-android-release`, que fixava la 9.8.2.
- **Sense `cache: gradle`:** falla perquè `android/` encara no existeix quan s'instal·la el JDK.
- **El certificat esperat continua sent el secret `ANDROID_RELEASE_CERT_SHA1`**, ja configurat, en lloc de la variable `ANDROID_CERT_SHA1` que proposava la tasca #335.
- El workflow que hi ha a `main` des del 28/10 compilava una versió antiga de l'app i s'ha de substituir per aquest en fer la `release/*`.

## Canvis al vault

- ADR-0029, guia d'instal·lació, [[00-index]], [[frontend]] i aquesta sessió.

## Pendent / següents passos

- [x] Execució manual del workflow des d'aquesta branca amb `publish=false`, abans de restringir l'environment.
- [x] Restringir l'environment `android-release` a `main` i als tags `v*.*.*`. A partir d'ara, la prova manual només es pot llançar des de `main`.
- [ ] Còpia de seguretat de la keystore en poder de dues persones.
- [ ] Primera release `v0.1.0`, que depèn de la `release/*` de l'SM.
- [ ] Prova en un mòbil real i actualització amb Obtainium de `v0.1.0` a `v0.1.1`.

## US de Taiga

- TG-329, TG-334, TG-335, TG-336, TG-337
