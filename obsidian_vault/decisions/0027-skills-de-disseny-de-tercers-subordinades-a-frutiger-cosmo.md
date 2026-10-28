---
titol: "Skills de disseny de tercers, opcionals i subordinades a Frutiger Cosmo"
tipus: adr
estat: proposada
data: "2026-10-28"
us: ["TG-342"]
font: "emilkowalski/skills (MIT), pbakaus/impeccable (Apache-2.0), Leonxlnx/taste-skill (MIT); .agents/skills/estetica-frutiger-cosmo/references/skills-de-tercers.md; .agents/scripts/skills-de-tercers.mjs"
etiquetes: [adr, frontend, skills, estetica, agents]
---

# ADR-0027 · Skills de disseny de tercers, opcionals i subordinades a Frutiger Cosmo

## Context

L'[[0020-frontend-expo-router-i-estetica-frutiger-cosmo|ADR-0020]] fixa la direcció visual («Frutiger Cosmo · Cel viu») i la skill `estetica-frutiger-cosmo` n'és la font de veritat. Existeixen tres col·leccions de skills de disseny que podrien millorar el resultat del frontend: les d'Emil Kowalski (moviment i detall), **Impeccable** (auditoria, crítica i passada final) i **Taste** (inspector de navegador i copy).

Revisades una a una, no s'hi poden afegir sense més:

- Les regles de casa de **Taste** prohibeixen gradients, vidre, ombres, resplendors, vores fines i navegació en píndola: justament els trets de Perseida.
- **Impeccable** escriu `PRODUCT.md`/`DESIGN.md` i pot instal·lar hooks: competirien amb el vault i `tokens.md` com a font de veritat.
- **Emil** recomana `NativeTabs`, sheets natius, Lottie i un format de molla propi, i tracta el hover i l'animació freqüent com a coses a treure, mentre que l'equip va decidir el 2026-10-13 un moviment i un so actius.
- Són skills **d'usuari** (`~/.claude/skills`): no són al repo i **no tothom les té**. `review-animations`, `prototype` i `pick-ui-library` són només manuals.

## Decisió

1. **Opcionals i a nivell d'usuari.** No es copien al repo. Cap pas obligatori ni cap punt de la checklist en depèn.
2. **Subordinades al brief.** Treballen dins ADR-0020; mai en reobren paleta, tipografia, materials ni sons. Ordre d'autoritat: ADR i vault > `estetica-frutiger-cosmo` > skills de tercers. El detall de què s'usa, què es prohibeix i qui guanya cada conflicte és a `references/skills-de-tercers.md`.
3. **Detecció automàtica.** El hook `SessionStart` executa `.agents/scripts/skills-de-tercers.mjs --hook`: si hi són, l'agent les usa; si no, continua amb les del repo i **suggereix a la persona, una sola vegada**, instal·lar-les. Un subagent ho retorna com a `SUGGERIMENT PER A L'HUMÀ`. `PERSEIDA_SKILLS_HINT=off` ho silencia.
4. **Ús restringit.** Emil: la porta de freqüència i propòsit s'aplica a tot moviment **nou**, i `animate-expo` serveix per construir-lo. Impeccable: només com a lent d'avaluació (`audit`, `critique`, `polish`…), sense `init`, `document`, `extract`, `live`, `generate` ni `hooks`. Taste: només l'inspector i el bucle de captures en superfícies web (admin i pàgines públiques), amb `--allow` per a les regles que contradiuen el nostre estil.
5. **Les instal·la la persona**, mai l'agent, i els fitxers de treball (`.taste-skill/`, `.impeccable/`, `plans/`) són al `.gitignore`.

## Conseqüències

### Positives

- Millor moviment i més atenció al detall sense canviar la identitat visual.
- Auditories independents del nostre propi criteri (accessibilitat, rendiment, casos límit).
- Qui no té les skills treballa igual que fins ara; qui les té en treu partit, sense configurar res.

### Negatives (assumides)

- **Dependència externa no versionada**: el resultat varia segons qui té què i pot canviar quan aquelles skills s'actualitzin. S'ha de revisar `skills-de-tercers.md` si canvien noms o ordres.
- Impeccable descarrega un binari en el primer ús (verificat amb un *checksum* del seu repo). La instal·lació es fa **sense hooks**.
- L'allow-list de Taste i l'equivalència de molles amb Emil són un punt de partida **no provat en aquest repo**.
- Les skills d'usuari poden activar-se soles: per això la regla és a `AGENTS.md` (sempre carregat).

## Alternatives descartades

- **Copiar-les al repo** (com `frontend-design` o `ui-ux-pro-max`): les llicències ho permeten, però Impeccable en té uns 4.400 fitxers, s'hauria de seguir cada actualització i obligaria els altres a rebre-les encara que no les vulguin.
- **Adoptar Taste com a direcció visual**: contradiu ADR-0020.
- **Fer d'Impeccable la font de veritat** (`PRODUCT.md`/`DESIGN.md`): duplicaria el vault i `tokens.md`.
- **No integrar-ne cap**: es renuncia a una millora de moviment i d'auditoria gairebé gratuïta.

## Decisions preses amb la persona (2026-10-28)

- **Pàgines públiques de TG-343**: versió sobria de Frutiger Cosmo (mateixos colors i tipografies, sense cel ni vidre).
- **Impeccable**: sense `PRODUCT.md`/`DESIGN.md`; només la instrucció a `AGENTS.md`.
- **Moviment**: les curves i molles d'Emil s'afegeixen a `tokens.md` com a proposta a validar al dispositiu.
- **Abast**: s'inclou a la PR #52 (TG-342) en lloc d'una PR pròpia.

## Pendent de validar per l'equip

La *allow-list* de Taste (no provada en aquest repo), la plataforma que declararia Impeccable (el llenguatge visual és propi i igual a iOS i Android) i els valors de moviment, un cop provats en una *build* de release.

## US de Taiga relacionades

- TG-342 (tasca #342): s'inclou a la PR #52, que ja toca l'estètica, l'EAS Build i l'script `typecheck`.

## Enllaços

- [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]] · [[0021-subagents-agnostics-i-generador]] · [[0015-skills-agnostiques-i-vault-en-catala]] · [[0014-context-compartit-per-a-assistents-d-ia]]
- Guia d'instal·lació: [[skills-de-disseny-de-tercers]]
