---
titol: "Sessió 2026-11-23: targetes de progrés de fites al perfil (TG-57, tasques #564-#569)"
tipus: sessio
estat: vigent
data: "2026-11-23"
us: ["TG-57", "TG-59"]
font: "Taiga: TG-57 i tasques #564-#569; TG-58 (GET /api/users/me/achievements); TG-59 (base comuna); TG-385 (espai reservat del perfil)"
etiquetes: [sessio, frontend, fites, accessibilitat, i18n]
---

# Sessió 2026-11-23 · Targetes de progrés de fites al perfil (TG-57)

## Objectiu

Mostrar al perfil, per a cada categoria de fites, la que l'usuari intenta aconseguir i el seu progrés, i deixar feta la base que comparteix amb la TG-59 (secció de fites i compartir).

## Què s'ha fet

- **Coordinació amb TG-59:** totes dues US llegeixen el mateix endpoint i comparteixen la fila amb barra de progrés. S'ha acordat amb la Simona que la TG-57 fa la base comuna a `features/achievements` (crida, hook i barra) i la TG-59 hi afegeix la llista i el botó de compartir.
- **Crida i hook (#564, #565):** `getMyAchievements` amb `withSession` i `useMyAchievements` amb càrrega, error i un reintent si l'error és transitori.
- **Fita actual (#565):** `categoryProgress` tria la primera fita no desbloquejada de cada categoria per `position` i, si s'han completat totes, l'última amb la barra plena.
- **Targetes (#566, #567):** una per categoria a l'espai de la ratxa del perfil (TG-385), amb icona, nom, «X/Y» (o «X/Y dies» a la ratxa) i barra; invitació a començar si la ratxa és 0; missatge si una categoria no té cap fita al catàleg.
- **Textos i accessibilitat (#568):** claus `achievements.*` en ca/es/en, amb singular i plural; el lector llegeix «Lluna plena, 8 de 14». Els noms de les fites es tradueixen per `code`, perquè el servidor només els té en català.
- **Proves:** tests de la crida, del hook, de `categoryProgress` i de la secció (càrrega, error amb i sense reintent, enhorabona, ratxa a 0, progrés per sobre de la meta, canvi d'idioma i fita desconeguda). El test del perfil substitueix la secció per un component fals.
- **Prova a la web:** perfil amb les cinc targetes en castellà, «0/1 día» i la invitació a començar la ratxa.

## Pendent

- Prova al mòbil amb l'APK de la release de final de sprint.
- TG-59: llista de totes les fites i compartir, sobre aquesta base.
