---
titol: "ADR-0029: APK d'Android a GitHub Releases amb Obtainium"
tipus: adr
estat: proposada
data: "2026-11-05"
us: ["TG-329", "TG-334", "TG-335", "TG-336", "TG-337"]
font: "US TG-329 de Taiga i tasques #334-#337; .github/workflows/android-release.yml; frontend/plugins/withAndroidRelease.js"
etiquetes: [adr, android, release, ci, seguretat]
---

# ADR-0029 · APK d'Android a GitHub Releases amb Obtainium

## Context

Cal poder ensenyar l'app connectada a producció en un mòbil real. Expo Go no serveix amb el nostre OAuth ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]), sense compte d'Apple Developer només es distribueix per a Android, i no volem dependre de cap botiga d'apps. El repo és públic, de manera que els APK també ho són i la keystore és un secret crític.

## Decisió

GitHub Actions compila i signa l'APK amb `android-release.yml`. Un tag `vX.Y.Z` sobre `main` crea una GitHub Release amb un sol APK, `perseida-vX.Y.Z.apk`, que s'instal·la i s'actualitza amb Obtainium.

- `versionName` és el tag sense la `v` i `versionCode` és el número d'execució del workflow, que sempre creix. Els aplica el config plugin `withAndroidRelease`.
- Els secrets de signatura viuen a l'environment `android-release` i només els fa servir el job `build`. El job `release`, que té permís d'escriptura, no hi té accés.
- El workflow atura la publicació si la signatura, el certificat o la versió de l'APK no són els esperats.

## Conseqüències

### Positives

- Qualsevol persona pot instal·lar l'app sense compilar res ni iniciar sessió a GitHub.
- Cada versió s'instal·la a sobre de l'anterior, sense desinstal·lar.

### Negatives (assumides)

- **Gradle 9.4.1:** la tasca #334 demanava Gradle 9.8.1 o superior, però cap versió corregida compila l'app (vegeu el comentari de `withAndroidRelease.js`). Es manté la 9.4.1, amb tres advisories coneguts, fins que React Native i Expo actualitzin Kotlin. Gradle només s'usa en compilar i no entra a l'APK.
- Sense `cache: gradle`: `android/` encara no existeix quan s'instal·la el JDK, de manera que cada compilació és més lenta.
- Si es perd la keystore, les versions noves no es poden instal·lar a sobre de les antigues i cal registrar un SHA-1 nou a Google Cloud.
- Android i Play Protect avisen d'una font desconeguda en instal·lar l'app.
- L'APK només és útil mentre duri el backend de producció.

## Alternatives descartades

- EAS Build: cua i límits del pla gratuït, i un compte extern més.
- Google Play: 25 $ i una verificació lenta.
- F-Droid oficial: compila des del codi font i revisa durant setmanes.
- IzzyOnDroid i Firebase App Distribution: afegeixen un tercer sense aportar res que necessitem.

## US de Taiga relacionades

- TG-329 (tasques #334, #335, #336 i #337)

## Enllaços

- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
- [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]
- [[0026-produccio-per-ports-nat-amb-duckdns-i-certificat-dns-01]]
- [[instal-lar-app-android]]
