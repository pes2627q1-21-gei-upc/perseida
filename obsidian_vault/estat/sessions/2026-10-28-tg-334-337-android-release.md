---
titol: "TG-334–TG-337: preparació de release Android"
data: "2026-10-28"
tipus: sessio
estat: en-progres
etiquetes: [android, github-actions, release, taiga]
---

# TG-334–TG-337: preparació de release Android

## Context

S'ha actualitzat la branca `feature/TG-334-android-release` amb els canvis previs de TG-329. La configuració Expo registra el config plugin `withAndroidRelease`.

## Canvis preparats

- Actualització del config plugin i les proves perquè fixin Gradle 9.8.2 i el checksum oficial.
- Nou workflow `.github/workflows/android-release.yml` amb trigger de tags `v*.*.*` i execució manual.
- Versions de Node, Java i GitHub Actions fixades segons els criteris facilitats.
- Construcció d'APK signat, comprovació de signatura i comparació de SHA-1.
- Esborrany d'ADR-0027 per registrar la decisió de Gradle.

## Secrets i variables requerits

A l'entorn protegit `android-release` cal configurar:
- Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_RELEASE_CERT_SHA1`.
- Variables: `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_API_BASE_URL`.

El workflow defineix `EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME=app.perseida`.

## Pendents de validar

- Executar proves i lint del frontend.
- Executar la compilació Android a CI i confirmar compatibilitat de Gradle 9.8.2.
- Confirmar que la SHA-1 configurada coincideix amb el certificat de release.
- Completar les comprovacions d'instal·lació/actualització i Obtainium de TG-336.
- Revisar els criteris exactes i tancar les tasques Taiga només després de completar la Definition of Done.
- No s'ha fet push, merge ni PR.
