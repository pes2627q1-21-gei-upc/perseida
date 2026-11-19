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
- `GelIconButton` (nou, amb tests) i l'opció `compact` de `GlassPanel` a `src/shared/ui`.
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
- [ ] Prova en dispositiu: entrada dels missatges, punt que batega, focus del camp després d'enviar, anell de focus (`boxShadow` amb *spread*) a Android, ordre de lectura de la llista invertida amb TalkBack/VoiceOver.

## US de Taiga

- TG-64, TG-469
