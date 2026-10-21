---
name: revisar-pr
description: Fa la review d'una PR de Perseida d'una altra persona - llegeix la PR amb gh (o MCP de GitHub, o en local), comprova CI, lint, tipus i tests, delega al subagent reviewer-arquitectura i retorna troballes per severitat sense publicar res. Usa-la quan la persona demani revisar una PR, una branca o un diff.
---

# Revisar una PR

Reps una PR (URL, número o branca) i retornes una review argumentada. No edites codi. No publiques comentaris, aprovacions ni rebutjos a GitHub si la persona no ho demana explícitament, després d'ensenyar-li el text exacte.

Segueix `AGENTS.md` i la skill `vault-context`. Protocol de dubtes: res d'inventar; si falta una dada o una regla és ambigua, **pregunta a la persona** (agrupat, amb opcions i recomanació).

## Nivell d'exigència

Review **laxa amb l'estil**: només s'informa del que **viola una norma escrita** (vault, ADR, DoD, plantilla de PR, README) o és **bloquejant** (CI en vermell, bug, seguretat, secret, ruptura d'arquitectura, criteri d'acceptació incomplert). Preferències d'estil, noms, format, refactors opcionals i suggeriments «estaria bé» **no es reporten** (el lint ja cobreix el format). Cada troballa cita la norma o el motiu de bloqueig. Si dubtes que sigui una violació, pregunta; no ho posis com a troballa.

## Passos

1. **Obtén la PR.** Accés a GitHub i ordres: `references/verificacio-pr.md` (`gh` → suggerir instal·lar-lo → MCP de GitHub → local). Llegeix títol, descripció, fitxers, diff i comentaris existents.
2. **Context de Taiga (opcional).** Si hi ha `TG-NN` (donat o a la PR) i l'MCP de Taiga és disponible, llegeix la US/tasca i els criteris d'acceptació. Si no, segueix sense.
3. **Verifica la CI i el local.** `gh pr checks` i les ordres de lint, tipus i tests dels directoris tocats en un worktree temporal (vegeu la referència). Una comprovació en vermell és una troballa CRÍTICA; si no la pots executar, ho dius.
4. **Revisa el diff.** Delega a `reviewer-arquitectura` (arquitectura hexagonal, DoD, checklist de PR, eficiència de consultes, seguretat, errors, estètica, WCAG). El prompt de delegació inclou la branca i la base de la PR, el worktree o el rang del diff, i els criteris de la US si els tens (el subagent no veu res més). No dupliquis els seus criteris. Descarta del seu informe les troballes BAIXA i qualsevol cosa d'estil que no violi cap norma. Afegeix tu, de la plantilla `.github/pull_request_template.md`:
   - Criteris d'acceptació complerts (si tens la US).
   - Tests per al codi nou.
   - Vault actualitzat si canvia l'arquitectura o hi ha una decisió.
   - Cap secret, `.env` ni dada personal.
   - Casella d'assistents d'IA omplerta.
5. **Informa.** Format del subagent: `[SEVERITAT] fitxer:línia - problema (norma o motiu de bloqueig). Suggeriment.` ordenat per gravetat, només CRÍTICA, ALTA i MITJANA si violen una norma, més:
   - **CI i local:** taula `comprovació → resultat real`.
   - **Veredicte:** aprovable / cal canvis.
   - Punts verificats sense problemes i preguntes per a la persona.
6. **Publicar (només si ho demana).** Mostra el text exacte (comentaris en línia o resum) i espera un sí abans d'enviar-lo amb `gh pr review`/`gh pr comment`. Aprovar o rebutjar la PR és decisió de la persona.

## Què NO fer

- No editis fitxers de la PR ni la teva branca; no facis push, merge ni PR.
- No donis la PR per verda sense haver vist CI i execució local (o dir clarament què falta).
- No inventis regles que no són al vault; no demanis ni escriguis credencials.
- No escriguis a Taiga.
