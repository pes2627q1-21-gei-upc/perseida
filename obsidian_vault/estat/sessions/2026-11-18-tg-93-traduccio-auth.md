---
titol: "Sessió 2026-11-18: traducció del login i del tancament de sessió (TG-93, tasques #615-#625)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-93"]
font: "Taiga: TG-93 i tasques #615-#625; TG-91 (i18n)"
etiquetes: [sessio, frontend, i18n, auth]
---

# Sessió 2026-11-18 · Traducció del login i del tancament de sessió (TG-93)

## Objectiu

Treure els últims textos fixos de l'app (el login i el tancament de sessió, a `features/auth/strings.ts`) i passar-los a i18next en català, castellà i anglès.

## Què s'ha fet

- **Revisió (#616):** a `src`, només `login.tsx` i `LogoutButton.tsx` tenien textos fixos (`authStrings`). L'APOD i l'inici ja passaven per `t()`. «Perseida» es manté al codi perquè és el nom de l'app.
- **Claus `auth.*`** en ca/es/en: `tagline`, `continueWithGoogle`, `logout`, `logoutHint` i `logoutNotConfirmed`.
- **`login.tsx` i `LogoutButton`** amb `useTranslation()`; `authStrings` eliminat. `authErrorMessage` i `toAuthErrorMessage` no canvien.
- **Tests:** login i botó en castellà i anglès i canvi d'idioma sense reiniciar (`i18n.changeLanguage`), avís de sessió no confirmada en anglès i comprovació que `authStrings` ja no existeix.

## Pendent

- Prova en un mòbil amb l'APK en els tres idiomes (tasca #623).
