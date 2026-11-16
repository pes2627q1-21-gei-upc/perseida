---
name: rebre-review
description: Processa els comentaris d'una review rebuda a una PR pròpia de Perseida - els llegeix amb gh (o MCP de GitHub, o enganxats), valida cadascun contra el codi, aplica el que té sentit amb commits atòmics, respon raonant els desacords i comprova CI, lint, tipus i tests. Usa-la quan la persona vulgui atendre una review o uns comentaris de PR.
---

# Rebre una review

Reps els comentaris d'una review de la teva PR i els atens amb criteri tècnic, no per cortesia. Un comentari no és una ordre: es **verifica** abans d'aplicar-lo.

Segueix `AGENTS.md` i la skill `vault-context`. Protocol de dubtes: si un comentari és ambigu o dues solucions són raonables, **pregunta a la persona** (agrupat, amb opcions i recomanació).

## Passos

1. **Obtén els comentaris.** Accés a GitHub: `.agents/skills/revisar-pr/references/verificacio-pr.md` (`gh` → suggerir instal·lar-lo → MCP de GitHub → que la persona els enganxi).
   ```bash
   gh pr view <PR> --comments
   gh pr view <PR> --json reviews,comments
   gh api --paginate repos/{owner}/{repo}/pulls/<PR>/comments
   gh pr checks <PR>
   ```
   Inclou els comentaris en línia, els resums de review i els checks fallats de la CI (cadascun és un punt a corregir).
2. **Context de Taiga (opcional).** Si hi ha `TG-NN` i l'MCP de Taiga és disponible, llegeix la US/tasca per entendre la intenció d'un comentari i els criteris. Si no, segueix sense.
3. **Classifica cada comentari.** Llegeix el codi al qual apunta i decideix, amb evidència:
   - **Correcte → aplica'l.**
   - **Incorrecte o ja resolt → respon** raonant, amb referència al codi, a una ADR o a un criteri. No cedeixis per evitar el conflicte.
   - **Ambigu o amb diverses opcions → pregunta** a la persona.
   - **Fora d'abast de la US → proposa** una issue o subtasca; no ho facis dins la PR.
   Presenta la taula `comentari → decisió → motiu` i espera el vistiplau de la persona abans d'aplicar res que canviï comportament o arquitectura.
4. **Aplica.** A la teva branca `feature/*`, el canvi mínim per comentari, amb les skills de domini que toquin. Commits atòmics `TG-NN tipus(àmbit): resum`, un canvi lògic per commit, seguint les instruccions de la persona sobre atribució. Si el canvi altera l'arquitectura, actualitza el vault (`obsidian-markdown`).
5. **Verifica.** Abans de donar-ho per acabat, executa lint, tipus i tests dels directoris tocats (ordres a `verificacio-pr.md`) i comprova que cap check de CI queda en vermell. Informa del resultat real de cada ordre. Si el mateix punt falla tres cops, atura't i pregunta.
6. **Respondre i publicar (només si ho demana).** Redacta les respostes als comentaris i mostra-les. No les enviïs ni facis push si la persona no ho demana explícitament. Marcar converses com a resoltes és decisió seva.

## Què NO fer

- No apliquis cap comentari sense haver-lo verificat al codi; res d'acord performatiu («tens tota la raó!»).
- No afebleixis un test ni una regla de lint per fer passar la CI.
- No facis push, merge ni PR si la persona no ho demana; no treballis fora de `feature/*`.
- No demanis ni escriguis credencials; no escriguis a Taiga.
