---
name: frontend-formulari
description: Crea formularis amb react-hook-form i zod, errors per camp mapats des del problem+json `errors`, toast per errors globals i accessibilitat. Usa-la quan calgui un formulari nou (alta, edició, informe, cerca) al frontend.
---

# Frontend: formulari

Construeix formularis amb `react-hook-form` + `zod`. La validació del client és de comoditat (feedback < 100 ms sense xarxa); la vàlida és la del backend. Frontend "tonto": cap regla de negoci ni de seguretat.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Els errors globals, el toast i la traducció per `code` són a la skill `gestio-errors`; aquí només es lliguen. Per a UX d'errors i accessibilitat de formularis, consulta `ui-ux-pro-max` (`references/pro-rules.md`). **Accessibilitat obligatòria (WCAG 2.2 AA):** tot el que es fa ha de complir la guia `../frontend-component/references/accessibilitat.md`.

## Quan usar-la / quan NO
- Usa-la: qualsevol formulari d'entrada d'usuari a `src/features/<mòdul>/components` o pàgina.
- NO: la crida a l'API (`frontend-crida-api`), la pàgina que l'allotja (`frontend-pagina`), components d'entrada genèrics reutilitzables (`frontend-component`), disseny del toast/errors (`gestio-errors`).

## Protocol de dubtes (OBLIGATORI)
No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes concretes d'aquesta skill (abans d'escriure):
1. Quin endpoint rep el formulari i quin és el cos segons l'OpenAPI (camps, tipus, obligatoris)? No inventis camps.
2. Quines regles de validació de comoditat vol l'humà (longituds, formats)? Han de reflectir el contracte; les regles de negoci no s'hi dupliquen.
3. Quins camps, etiquetes, textos d'ajuda i missatges d'error per camp (claus i18n ca/es/en)?
4. Què passa en enviar: estat loading/disabled, navegació, toast d'èxit, reinici del formulari?
5. Hi ha camps sensibles (contrasenya, dades personals)? Autocompletat/gestor de contrasenyes i política de no registrar-los.
6. Es manté un esborrany (només si l'humà ho vol i on)? Mode offline/outbox?
7. Dependències noves (`react-hook-form`, `zod`, resolvers)? Pregunta abans; versió fixada amb pnpm (verifica'n l'existència i compatibilitat).
8. Accessibilitat (WCAG 2.2 AA): quins límits o decisions cal confirmar per a això (escala de text, anuncis `polite`/`assertive`, variant d'alt contrast, eines de test)? Vegeu les preguntes d'accessibilitat de la guia.

## Passos
1. Llegeix el vault i l'OpenAPI de l'operació; deriva el tipus del cos des dels tipus generats.
2. Resol les preguntes anteriors.
3. Defineix l'esquema `zod` (només validació de comoditat) i el tipus del formulari; els missatges són claus i18n, no text.
4. Munta el formulari amb `useForm` + resolver de zod; components d'entrada de `shared/ui` amb **etiqueta visible**, ajuda i error a prop del camp (no només a dalt); `Controller` per als camps RN.
5. Envia amb la mutació de la feature (`frontend-crida-api`). Mentre dura: botó en `loading`/`disabled`, sense doble enviament.
6. Gestió d'errors del servidor: si l'`AppError` porta `errors` (problem+json), **mapa'ls per camp** amb `setError(field, { message: <clau i18n derivada de code> })`. Camps desconeguts i qualsevol altre error global van al toast (`gestio-errors`); mai text cru del servidor.
7. Accessibilitat: etiqueta per camp, `accessibilityHint`, error anunciat (`role="alert"` o equivalent), focus al primer camp amb error (i resum enllaçat si hi ha diversos), tipus de teclat i `autoComplete` adequats, tàctil >=44 pt, el teclat no tapa el camp enfocat; no depenguis només del color.
8. Textos amb i18next (ca/es/en); sense valors de disseny hardcodejats.
9. Escriu els tests (després del codi) i passa la checklist.

## Plantilla de codi (orientativa: el repo encara no té codi)
```tsx
// illustrative: names and fields must come from the real OpenAPI contract
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(1, 'form.title.required'), // i18n key, not text
});
type FormValues = z.infer<typeof schema>;

export function EventForm({ onSubmit }: { onSubmit: (v: FormValues) => Promise<void> }) {
  const { control, handleSubmit, setError, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (e) {
      // AppError.errors (from problem+json) -> per-field; the rest -> toast (gestio-errors)
      mapServerErrors(e, setError);
    }
  });
  // render fields with <Controller />, visible labels, per-field error text and a busy submit button
}
```
`@hookform/resolvers` és una llibreria addicional: pregunta/verifica abans d'afegir-la.

## Tests (després del codi)
- Jest + RNTL: validació de comoditat (feedback < 100 ms sense crida de xarxa), camps obligatoris, estat loading/disabled, no hi ha doble enviament.
- Mapatge dels `errors` d'un problem+json simulat als camps correctes; error global -> toast; cap text cru.
- Existència de claus i18n ca/es/en dels missatges.
- Cobertura de hooks i lògica >=70%; els components purament visuals queden exclosos.

## Checklist final
- [ ] Protocol `vault-context` seguit; camps i contracte presos de l'OpenAPI, cap invent.
- [ ] `react-hook-form` + `zod`; la validació és només de comoditat.
- [ ] Etiquetes visibles, error per camp (no només a dalt), ajuda, focus al primer error.
- [ ] Errors del servidor per camp via `errors`; globals via toast (`gestio-errors`); mai JSON/traça crus.
- [ ] Estats loading/disabled i protecció de doble enviament.
- [ ] Textos i missatges per i18n ca/es/en.
- [ ] Accessibilitat (teclat, lectors, >=44 pt, no només color); checklist de `ui-ux-pro-max/references/pro-rules.md`.
- [ ] Dades sensibles tractades sense registrar-les; cap secret.
- [ ] Tests escrits; cap dependència nova sense permís.
- [ ] Accessibilitat WCAG 2.2 AA: checklist de `../frontend-component/references/accessibilitat.md` completada (lectors i i18n, text gran i contrast, reduce motion, teclat/focus, tests per rol/etiqueta).

## Què NO fer
- No implementis regles de negoci ni de seguretat al client; no confiïs en la validació local.
- No mostris missatges crus del servidor ni de zod; usa claus i18n.
- No usis placeholder com a única etiqueta; no posis errors només a dalt del formulari.
- No dupliquis `gestio-errors`; no inventis camps ni codis.
- No editis `.claude/skills/`.
