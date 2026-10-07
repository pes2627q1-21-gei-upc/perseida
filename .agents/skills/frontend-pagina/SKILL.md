---
name: frontend-pagina
description: Crea pantalles/rutes amb Expo Router a src/app (grups (app) mòbil i (admin) escriptori), layouts responsive, estats loading/empty/error, safe areas i i18n ca/es/en. Usa-la quan calgui una pàgina, ruta o layout nous.
---

# Frontend: pàgina (ruta Expo Router)

Crea una pantalla fina que compon components i hooks existents. La pàgina només orquestra presentació: la lògica de dades és als hooks de la feature (`frontend-crida-api`) i el negoci és al backend.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Per a decisions de disseny (paleta, tipografia, accessibilitat, jerarquia) usa les skills `ui-ux-pro-max` i `frontend-design`; l'estètica és la de `frontend-component/references/frutiger-cosmo.md` i la matriu de dispositius la de `frontend-component/references/responsive.md`. No es copien aquí.

## Quan usar-la / quan NO
- Usa-la: fitxer nou o canvi a `src/app/**` (rutes, `_layout.tsx`, grups `(app)` i `(admin)`).
- NO: components reutilitzables (`frontend-component`), formularis (`frontend-formulari`), crides a l'API (`frontend-crida-api`), minijocs (`frontend-jocs-dinamics`), errors/toasts (`gestio-errors`).

## Protocol de dubtes (OBLIGATORI)
No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes concretes d'aquesta skill (abans d'escriure):
1. Quina US/criteris d'acceptació (TG-NN) cobreix la pantalla i quin contingut/accions mostra? Hi ha mockup?
2. Pertany al grup `(app)` (mòbil) o `(admin)` (web/escriptori)? Quin rol hi accedeix? (l'autorització real és al backend; el client només amaga/redirigeix per comoditat)
3. Navegació: pestanyes, pila, modal? Quin camí i paràmetres de ruta (`deep link`)?
4. Quines dades necessita i quins hooks existeixen? Si falten, aturar-se i usar `frontend-crida-api`.
5. Com són els estats **loading**, **empty** i **error** d'aquesta pantalla (text, accions, il·lustració)? Cal pull-to-refresh o paginació?
6. Quines claus i18n (ca/es/en) calen? Qui valida les traduccions?
7. Comportament per classe de dispositiu (mòbil/tauleta/escriptori): columnes, navegació lateral vs. pestanyes?
8. Dependències noves? Pregunta abans; versió fixada amb pnpm.

## Passos
1. Llegeix el vault i l'estructura actual de `src/app`; reutilitza components i hooks existents.
2. Resol les preguntes. Defineix la ruta dins del grup correcte (`src/app/(app)/...` o `src/app/(admin)/...`) i el `_layout.tsx` que li toqui (el layout fixa safe areas, capçalera i navegació).
3. Layout responsive mobile-first amb els breakpoints dels tokens; cap amplada fixa; sense scroll horitzontal; `maxWidth` de lectura a pantalles grans.
4. Safe areas (notch/dynamic island/barra de gestos) a capçalera, barres i CTA fixos; contingut amb insets.
5. Estats obligatoris: loading (esquelet o indicador), empty (invitació a l'acció), error (a través de l'ErrorBoundary/toast i, si cal, un estat inline amb "reintentar"; la política és a `gestio-errors`). Mai JSON/traça crus.
6. Tots els textos amb `t()` d'i18next (ca/es/en); cap text hardcodejat.
7. Accessibilitat: ordre de focus = ordre visual, títols de pantalla, etiquetes, tàctil >=44 pt, reduced motion.
8. `(app)`: pensat per a mòbils actuals; `(admin)`: pensat per a escriptori (aprox. 1280-1536 px) però usable en qualsevol mòbil i PC.
9. Escriu els tests (després del codi) i passa la checklist.

## Plantilla de codi (orientativa: el repo encara no té codi)
```tsx
// src/app/(app)/events/[id].tsx (illustrative)
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useEvent } from '@/features/events/hooks/useEvent';
import { Screen, EmptyState, LoadingState } from '@/shared/ui';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useEvent(id);

  if (isLoading) return <LoadingState />;
  if (isError) return <EmptyState title={t('common.error.generic')} onRetry={refetch} />;
  if (!data) return <EmptyState title={t('events.empty')} />;
  return <Screen title={data.title}>{/* compose feature components */}</Screen>;
}
```
Noms de components, claus i hooks són d'exemple: confirma'ls amb el repo i l'humà.

## Tests (després del codi)
- RNTL per a la lògica de la pantalla: renderitza els tres estats (loading/empty/error) amb hooks simulats; claus i18n existents en ca/es/en.
- Els components purament visuals queden exclosos de cobertura.
- Comprovació manual: matriu de `frontend-component/references/responsive.md`.

## Checklist final
- [ ] Protocol `vault-context` seguit; cap valor inventat; preguntes resoltes.
- [ ] Ruta al grup correcte, layout amb safe areas, sense scroll horitzontal.
- [ ] Estats loading, empty i error implementats; cap JSON/traça a la UI.
- [ ] Tots els textos via i18n ca/es/en.
- [ ] Zero valors hardcodejats; tokens de tema; estètica Frutiger Cosmo.
- [ ] Accessibilitat (focus, etiquetes, >=44 pt, reduced motion) i checklist de `ui-ux-pro-max/references/pro-rules.md`.
- [ ] Provat en mòbil petit, gran, tauleta i escriptori.
- [ ] Cap regla de negoci/seguretat al client.

## Què NO fer
- No facis `fetch` ni contenguis lògica de negoci a la pantalla.
- No hardcodegis textos, colors, espais ni radis.
- No confiïs en el client per a l'autorització (rol = comoditat de UI; el backend decideix).
- No dupliquis `gestio-errors`; no inventis rutes, camps ni traduccions.
- No editis `.claude/skills/`.
