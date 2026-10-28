---
titol: "Gradle 9.8.2 per a la release Android"
tipus: adr
estat: proposat
data: "2026-10-28"
etiquetes: [android, gradle, release, seguretat, ci]
---

# ADR-0027: Gradle 9.8.2 per a la release Android

## Context

La història TG-334 exigeix Gradle 9.8.1 o superior i recomana 9.8.2. La configuració anterior fixava Gradle 9.4.1, versió assenyalada amb avisos de seguretat al registre de la tasca TG-329.

## Decisió proposada

Fixar Gradle 9.8.2 al config plugin `withAndroidRelease`, amb el checksum SHA-256 publicat per Gradle. Afegir un workflow de GitHub Actions per generar i verificar l'APK signat.

## Conseqüències i riscos

- La versió objectiu i el checksum queden versionats al repositori.
- La compilació amb Expo 58 i React Native 0.88.0 s'ha de validar a CI; el canvi de versió no és prova suficient de compatibilitat.
- La publicació exigeix secrets de signatura i una empremta SHA-1 esperada configurats a l'entorn protegit `android-release`.
- Si Gradle 9.8.2 no compila amb les versions actuals dels plugins, cal resoldre la compatibilitat abans de publicar una release.

## Validació pendent

- Executar les proves del config plugin.
- Executar la compilació Android de release a GitHub Actions.
- Verificar la signatura i comparar la SHA-1 del certificat amb la configurada a l'entorn.
