---
titol: "Sessió 2026-11-19 · TG-469 peces de la sala de xat"
tipus: sessio
estat: vigent
data: "2026-11-19"
us: ["TG-64", "TG-469"]
font: "Branca feature/TG-64-peces-sala (PR C de TG-64, apilada sobre feature/TG-64-llista-sales); tests en vermell b7c98bc..34938a5"
etiquetes: [sessio, frontend, xat, accessibilitat, frutiger-cosmo]
---

# Sessió 2026-11-19 · TG-469 peces de la sala de xat

## Objectiu

Posar en verd els tests de les peces de la sala de xat (PR C de TG-64) sense tocar-los: dades pures, superfície de les bombolles, bombolla, compositor i llista.

## Què s'ha fet

- `chatCache.ts`, `chatItems.ts` (amb `arrivedKeys`, test nou previ) i `bubbleSurface.ts` a `src/features/chat/`.
- `MessageBubble`, `MessageComposer` i `MessageList` a `src/features/chat/components/`.
- `GelIconButton` (nou, amb tests) a `src/shared/ui`. L'opció `compact` de `GlassPanel` es va afegir i es va treure en la mateixa sessió, quan el compositor va deixar de fer servir `GlassPanel`.
- Revisió de la PR C: Stryker només exclou estils (`createStyles`); `arrivedKeys` no es deixa enganyar pels pendents; focus a la bombolla després de «Reintenta»; `bottomInset` al compositor; `composerSurface` amb test de contrast; `Intl.DateTimeFormat` en memòria (`dateFormat.ts`); `{{max}}` formatat a `chat.composer.tooLong`; anunci a iOS del motiu pel qual no es pot enviar; `buildChatItems` sense `now`.
- Textos `chat.*` de la sala en ca/es/en.
- Detall a [[frontend#Sala de xat: peces de la pantalla (TG-469)]].

## Decisions preses

- Decisions de la persona (via l'agent principal): separador de dia amb `dateStyle: 'long'`; la bombolla només mostra l'hora; el compositor retorna el focus al camp després d'enviar; el compositor no té reintent propi; sense so ni hàptics en aquesta PR.
- Decisió d'implementació: la bombolla en enviament no és translúcida (amb opacitat, el text blanc del gel baixa de 4,5:1 sobre parts clares del cel); es distingeix amb el gel mat, el punt que batega i el text «Enviant».
- Decisió d'implementació: la nota d'error d'una bombolla va sobre vidre de fila, perquè `state.danger` sobre el cel nu no arriba a 4,5:1.

## Canvis al vault

- [[frontend]]: secció «Sala de xat: peces de la pantalla (TG-469)».

## Pendent / següents passos

- [ ] Muntar la pantalla de la sala (PR D de TG-64) i afegir-hi `expo-haptics`.
- [ ] Prova en dispositiu: entrada dels missatges, punt que batega, focus del camp després d'enviar, focus a la bombolla després de «Reintenta», anell de focus (`boxShadow` amb *spread*) a Android.
- [ ] Comprovar al dispositiu l'ordre en què VoiceOver i TalkBack llegeixen la llista invertida (`FlatList inverted`); de moment es deixa com està.

## US de Taiga

- TG-64, TG-469
