# Skills de tercers com a reforç (opcional)

Tres col·leccions de skills de disseny es poden instal·lar a **nivell d'usuari** (no són al repo): les d'Emil Kowalski, **Impeccable** i **Taste**. Aquí s'hi fixa què en prenem, què ignorem i qui guanya quan discrepen. Decisió: `obsidian_vault/decisions/0027-skills-de-disseny-de-tercers-subordinades-a-frutiger-cosmo.md` (ADR-0027); instal·lació: `obsidian_vault/guies/skills-de-disseny-de-tercers.md`.

## Regla d'or: el brief guanya

La direcció visual de Perseida (ADR-0020, `principis.md`, `tokens.md`, `receptes.md`, `cel-viu.md`, `so-i-moviment.md`) és el **brief fix**. Les skills de tercers treballen **dins** del brief i mai el reobren: ni paleta, ni famílies tipogràfiques, ni llenguatge de materials (vidre, gel, cel viu), ni sons. Les tres ja ho admeten: Impeccable («the brief wins», una skill amb un món visual fixat no el redirigeix) i Taste (només l'aplica si no hi ha marca prèvia). Si una skill de tercers contradiu el brief, **ignora aquella part** i deixa-ho dit en una línia al lliurament; no preguntis cada cop, només si dubtes de quin costat cau.

Ordre d'autoritat: ADR i vault > referències d'`estetica-frutiger-cosmo` > skills de tercers.

## Són opcionals: detecta-les abans d'usar-les

Són al `~/.claude/skills` de cada persona, no al repo, i **no tothom les té**. Cap pas obligatori ni cap punt de la checklist depèn que hi siguin.

**Com saber si hi són.** En obrir la sessió, el hook `SessionStart` (`.agents/scripts/skills-de-tercers.mjs --hook`) ja diu què hi ha: «Disponibles: …» i/o «No instal·lades: …». Si no ho has vist (altres eines, subagents), executa `node .agents/scripts/skills-de-tercers.mjs` (o `--json`). Cerca a l'usuari i al projecte (`.claude`, `.agents`, `.codex`, `.cursor`, `.gemini`, `.opencode`, `.grok`, `.hermes`) i compta una col·lecció com a instal·lada si hi són les seves skills clau: Emil (`emil-design-eng` i `animate-expo`), Impeccable (`impeccable`) i Taste (`design-taste-frontend`).

**Si hi són:** usa les integracions d'aquest document, sempre sota el brief.

**Si no hi són:**
1. Continua amb les skills del repo, sense perdre cap pas.
2. **Suggereix-ho a la persona una sola vegada per sessió**, només si fa feina visual de frontend (no per a backend, infra ni documentació), amb una frase i l'ordre exacta que imprimeix l'script. Exemple: «Pots potenciar el resultat instal·lant les skills d'Emil Kowalski (moviment): `npx skills@latest add emilkowalski/skills -g -a claude-code -s "*" -y --copy`. És opcional».
3. No insisteixis si diu que no. `PERSEIDA_SKILLS_HINT=off` silencia el hook.
4. **Subagent** (no pot preguntar): afegeix a la sortida un bloc **`SUGGERIMENT PER A L'HUMÀ`** amb la mateixa frase i ordre, al costat de `PREGUNTES PER A L'HUMÀ` si n'hi ha.
5. No instal·lis res tu mateix sense que ho demani la persona: instal·lar és codi de tercers al seu usuari (vegeu la guia).

Si una skill manual (vegeu «Només manuals») no es pot invocar, llegeix-ne les referències (p. ex. `~/.claude/skills/review-animations/STANDARDS.md`) si existeixen, o demana a la persona que l'executi.

Invoca-les sempre **amb una tasca concreta**: Emil respon només «I'm ready…» si s'invoquen sense pregunta.

## Què prenem de cadascuna

### Emil Kowalski (`emilkowalski/skills`, MIT)

| Skill | Ús | Condicions |
|---|---|---|
| `animate-expo` | **Construir** moviment a React Native/Expo: porta de freqüència i propòsit, quin fil, quines propietats, molla o temps, gests, hàptics, reduced motion | Dins `so-i-moviment.md`. Ignora-hi `NativeTabs`, `presentation: 'formSheet'` i Lottie (vegeu «Conflictes») |
| `emil-design-eng` | Lent de revisió del detall (components, estats premut, assimetria entrada/sortida) | Les parts de CSS/hover valen només per a l'admin web |
| `review-animations` | Revisar el moviment d'un diff amb un llistó alt | **Manual** (`disable-model-invocation`): la persona la invoca |
| `improve-animations`, `find-animation-opportunities` | Auditar i proposar moviment, només de lectura, amb valors exactes | Escriuen a `plans/`; no inclouen l'ambient ni les respostes ja decidides a `so-i-moviment.md` |
| `break-ui` | Estressar un component amb dades pitjor cas: textos llargs ca/es/en, 0 elements, números enormes, escala de text 200 % | El commutador «Worst case» és temporal: **no es fusiona** |
| `apple-design` | Només la **física** dels gests (inèrcia, *rubber-band*, interrompibilitat) | Cap dada visual ni tipografia: les nostres són als tokens; mai assets ni sons d'Apple |
| `animate`, `animation-performance`, `animation-vocabulary`, `mobile-native` | Només per a l'admin web (React Native Web) i com a glossari | Són de web/CSS; no s'apliquen al codi natiu |
| `ask-sonner`, `pick-ui-library`, `write-swift`, `prototype` | **No s'usen**: el toast és propi (`gestio-errors`), no hi ha Swift, i les dues darreres són manuals i de web | — |

### Impeccable (`pbakaus/impeccable`, Apache-2.0)

Es fa servir com a **lent d'avaluació**, no com a dissenyador. Instal·lat sense hooks.

| Ordre | Ús |
|---|---|
| `audit` (variant natius) | Auditoria tècnica del codi RN: accessibilitat, rendiment, teming, text escalable |
| `critique` | Revisió UX amb puntuació heurística; no hi ha detector de navegador a natiu |
| `polish` | Passada final **sense canviar el món visual** |
| `harden`, `clarify`, `onboard`, `adapt`, `shape` | Casos límit, text d'interfície, estats buits, classes de dispositiu, descoberta de la tasca. La política d'errors és `gestio-errors`; els textos van per i18n (ca/es/en) i els valida la persona; els breakpoints són els dels tokens |
| `distill`, `optimize`, `layout` | Només amb els tokens d'espaiat i tipografia existents |
| `animate`, `delight` | Substituïts per `animate-expo` i per l'**element memorable** de la pantalla |
| ~~`bolder`, `quieter`, `colorize`, `typeset`, `overdrive`~~ | **Prohibides**: canvien paleta, tipografia o ambició, i el brief és fix |
| ~~`init`, `document`, `extract`, `live`, `generate`, `hooks`~~ | **Prohibides**: escriuen `PRODUCT.md`/`DESIGN.md`/tokens (competirien amb el vault i `tokens.md`), editen el codi des del navegador o instal·len hooks |

Si Impeccable proposa executar `init` perquè no troba `PRODUCT.md`, respon que el brief és aquesta skill i continua com a **refinament del codi existent**. El seu mode de treball és *Operate* per a pantalles d'ús (admin, ajustos, llistes) i *Persuade* només per a les pàgines públiques. Les referències natives (`ios.md`, `android.md`) serveixen per a **comportament** (àrees segures, gest de tornada, mida de text, objectius tàctils), no per a estil: el nostre llenguatge visual és propi i igual a les dues plataformes.

### Taste (`Leonxlnx/taste-skill`, MIT)

És la menys compatible: les seves regles de casa prohibeixen **sense excepció** gradients, vidre, ombres i resplendors, vores d'1 px i navegació en píndola, que són justament els nostres trets (`principis.md`). Per això **no s'usa com a dissenyadora**: ni `draw.mjs` (dóna direccions, paleta i tipus), ni els passos 3–6 de la seva execució, ni el seu estil de casa.

Només s'aprofita, i **només per a superfícies web** (l'admin compilat amb React Native Web i les pàgines públiques estàtiques de TG-343):

- `scripts/inspect.mjs` en un navegador real, per veure desbordaments, text tallat o cobert, títols i contrast, amb `--allow` per a les seves regles que contradiuen el nostre estil. Punt de partida *(proposta a validar; no provat en aquest repo)*: `--allow gradient,shadow,button-fx,glass,outlined-box,hairline,pill-nav,heavy-shadow,heavy-borders,radius-mix,icon-chips,icon-tiles,palette-purple`. Les regles de contrast, desbordament, text petit i imatges trencades es deixen actives.
- El bucle «mira i corregeix» (captures a tres amplades) i `references/copy.md` (text concret, sense text de farciment).

A l'app mòbil no s'aplica: Chrome no executa React Native. Allà les captures es fan amb l'emulador o el dispositiu.

## Conflictes resolts

| La skill de tercers diu | Perseida diu | Guanya |
|---|---|---|
| Taste: sense gradients, vidre, ombres, resplendors, píndoles, vores fines | Vidre en capes flotants, gel en accions, reflex, cel viu | **Perseida** |
| Taste: direcció, paleta i tipus de la seva biblioteca | Paleta i famílies fixades a `tokens.md` | **Perseida** |
| Emil: de desenes de cops al dia, treu o gairebé elimina l'animació (hover inclòs) | El tile creix a 1,06 amb molla en focus/hover i l'ambient és viu (decisió del 2026-10-13) | **Perseida** per al que ja està decidit. La porta d'Emil s'aplica a **tot moviment nou** i a qualsevol acció iniciada amb teclat |
| Emil: molla amb `duration` + `dampingRatio` (0,8 per a sheets) | `damping 14, stiffness 160, mass 1` | **Perseida**. Equival a `dampingRatio` ≈ 0,55 (14 / (2·√160)): més rebotant que el 0,8 d'Emil, a propòsit per a l'estil Wii |
| Emil: `NativeTabs` i `formSheet` natius | Barra de pestanyes i sheets de vidre propis | **Perseida** (identitat). La navegació entre pantalles sí que usa la pila nativa d'Expo Router, sense reconstruir-la |
| Emil: «fes la crida, no presentis menús» | Protocol de dubtes: pregunta el que no és als tokens | **Perseida** per a valors no fixats. Dins els valors fixats, decideix |
| Emil: Lottie per a il·lustració i celebració | Escena viva amb Skia; dependència nova = preguntar | **Perseida** (preguntar abans) |
| Impeccable: `init`/`document` creen `PRODUCT.md` i `DESIGN.md` | Font de veritat: vault + `tokens.md` | **Perseida** |
| Impeccable: «effects with blur, backdrop-filter, shadow belong to the palette» | Màxim 2–3 `BlurView` per pantalla, cap en llistes | **Perseida** |

## Només manuals

`review-animations`, `prototype` i `pick-ui-library` porten `disable-model-invocation`: un agent no les pot invocar. Si en vols el resultat, la persona escriu `/review-animations` (recomanat abans d'una PR que toqui moviment).

## Fitxers que generen

`.taste-skill/`, `.impeccable/` i `plans/` (o `animation-plans/`) són **de treball local** i estan al `.gitignore`. Si una passada crea `PRODUCT.md` o `DESIGN.md` a l'arrel, no es fusionen: s'esborren o es demana a la persona.

## Decisions preses (2026-10-28)

- **Moviment**: les curves i les molles d'Emil són a `tokens.md` (`easing`, `springUi`, `pressScale`) com a *proposta a validar al dispositiu*: no es fixen al codi fins que la persona les hagi provat en una *build* de release. `duration.slow` (420 ms) és el sostre per a sheets i entrades de pantalla.
- **Pàgines públiques de TG-343** (inici, privadesa i condicions): **versió sobria de Frutiger Cosmo**: mateixos colors i famílies tipogràfiques que els tokens, sense escena de cel ni vidre, per a una lectura neta. Taste s'hi aplica només amb el seu inspector i `--allow`.
- **Impeccable**: sense `PRODUCT.md`/`DESIGN.md`; el brief és aquesta skill i s'omet `init`.
- **Tot en una sola PR** (la #52, TG-342).

Continuen **pendents**: validar la *allow-list* de Taste executant l'inspector sobre l'admin web, i quina plataforma declararia Impeccable (el llenguatge visual és propi i igual a iOS i Android).
