---
titol: "Sessió 2026-10-26: APK Android release signat i provat (TG-329)"
tipus: sessio
estat: vigent
data: "2026-10-26"
us: ["TG-329", "TG-330", "TG-331", "TG-332", "TG-333"]
font: "US TG-329 de Taiga; frontend/plugins/withAndroidRelease.js; frontend/app.json; frontend/package.json"
etiquetes: [sessio, frontend, android, release, signatura, oauth, tg-329]
---

# Sessió 2026-10-26 · APK Android release signat i provat

## Objectiu

Fer les tasques 330-333 de la US **TG-329** (distribuir l'APK d'Android per GitHub Releases amb Obtainium): keystore de release, client OAuth d'Android, compilació local i prova de l'APK, i correcció de les incidències que en surtin. Les tasques 334-337 (workflow `android-release.yml`, secrets, primera release i ADR) són d'una altra persona de l'equip.

## Què s'ha fet

1. **Keystore de release (TG-330):** PKCS12, àlies `perseida`, RSA 2048, validesa de 10000 dies. Es guarda fora del repositori i se n'ha passat una còpia a la persona de la 334 per un canal privat. `.gitignore` exclou `*.keystore`.
2. **Client OAuth d'Android (TG-331):** client nou «Perseida Android release» amb el paquet `app.perseida` i l'SHA-1 de la keystore de release, amb *Custom URI scheme* activat. El seu ID s'ha afegit a `GOOGLE_CLIENT_IDS` del backend. Com que `cd.yml` encara no és a `main`, el canvi s'ha aplicat a mà al servidor de producció i s'ha reiniciat el servei `api`.
3. **Config plugin `frontend/plugins/withAndroidRelease.js`:** com que `android/` es regenera amb `expo prebuild --clean`, el plugin:
   - afegeix `signingConfigs.release` a `app/build.gradle`, que llegeix el keystore i les contrasenyes de `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` i `ANDROID_KEY_PASSWORD` en temps de compilació (sense aquestes variables, signa amb la clau de debug);
   - fixa Gradle 9.4.1 amb el seu checksum a `gradle-wrapper.properties`;
   - té 6 tests de Jest.
4. **Nom de l'app:** `expo.name` = «Perseida» (l'slug no s'ha tocat).
5. **Dependències per al bundle release amb pnpm:** `babel-preset-expo` 58.0.20 i `@babel/plugin-transform-react-jsx` 7.29.7 com a devDependencies amb versió fixada. Metro no les trobava perquè pnpm no les eleva; la segona la carrega el preset de NativeWind (`react-native-css-interop/babel`).
6. **Compilació local (TG-332):** `assembleRelease` compila a Windows amb JDK 17, Build-Tools 36.0.0 i CMake 4.1.2. Per evitar el límit de longitud de rutes de Windows s'ha compilat des d'un worktree en una ruta curta. `apksigner` confirma que l'APK està signat amb la keystore de release.
7. **Prova a l'emulador (API 36, Google Play, x86_64):** el nom i la icona, el login amb Google, la sessió persistent en tancar i obrir l'app i el logout funcionen. L'APOD mostra l'estat d'error perquè l'API de la NASA estava caiguda; s'ha de tornar a provar quan torni.

## Decisions preses

- **Gradle 9.4.1, amb risc conegut:** està afectada per GHSA-j5m7-59rp-24f5, GHSA-xwqc-3h47-hg64 i GHSA-mvvg-497x-hmj8. Cap versió corregida compila l'app: l'AGP de React Native 0.88 exigeix Gradle >= 9.4.1, i Gradle 9.8.x porta Kotlin 2.4, que els plugins de Gradle de React Native i d'Expo (Kotlin 2.2.0) no poden llegir. S'ha de pujar a >= 9.8.1 quan actualitzin Kotlin. Es documentarà a l'ADR de la US (TG-337).
- **Esquema de redirect:** un client OAuth d'Android només accepta l'esquema del paquet. El build release necessita `EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME=app.perseida`; amb el valor per defecte (`perseida`), Google respon «Error 400». No s'ha canviat el valor per defecte de `googleConfig.ts` perquè afecta els builds de desenvolupament; ho ha de decidir l'equip. Vegeu [[0008-google-oauth2-pkce-jwks-i-sessio-propia]].
- **Signatura amb variables d'entorn:** cap contrasenya ni ruta del keystore s'escriu al repositori ni a `build.gradle`.
- **EAS descartat:** la US demana compilar amb Gradle a GitHub Actions.

## Canvis al vault

- Aquesta entrada de sessió. L'ADR de la distribució Android la fa la TG-337.

## Pendent / següents passos

- [ ] TG-334: el workflow ha de passar les variables `EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME=app.perseida`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (client «Perseida Android release»), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_API_BASE_URL` i les quatre de signatura.
- [ ] Decidir amb l'equip si es reparteix l'APK per ABI (ara és universal, uns 113 MB) o s'activa R8.
- [ ] Tornar a provar l'APOD quan l'API de la NASA funcioni.
- [ ] TG-337: documentar el risc de Gradle 9.4.1 a l'ADR.
- [ ] Revisió amb `reviewer-arquitectura` i PR cap a `develop` (la fa la persona).

## US de Taiga

- TG-329 (US)
- TG-330, TG-331, TG-332, TG-333 (tasques)
