---
titol: Skills de disseny de tercers (instal·lació i ús)
tipus: guia
estat: vigent
data: "2026-10-28"
us: ["TG-342"]
font: "ADR-0027; .agents/scripts/skills-de-tercers.mjs; .agents/skills/estetica-frutiger-cosmo/references/skills-de-tercers.md; instal·lació provada el 2026-10-28"
etiquetes: [guia, skills, frontend, estetica, agents]
---

# Skills de disseny de tercers (instal·lació i ús)

Tres col·leccions **opcionals** que milloren el frontend sense canviar la nostra identitat visual. Són d'usuari (no són al repo): cadascú decideix si les instal·la. Decisió i motius: [[0027-skills-de-disseny-de-tercers-subordinades-a-frutiger-cosmo]]. Què en prenem i què no: `.agents/skills/estetica-frutiger-cosmo/references/skills-de-tercers.md`.

Si no les tens, **no et falta res per treballar**: l'agent continua amb les skills del repo i, com a molt una vegada per sessió, et suggerirà instal·lar-les.

## Què aporta cadascuna

| Col·lecció | Per a què | Notes |
|---|---|---|
| [Emil Kowalski](https://github.com/emilkowalski/skills) (MIT) | Criteri de moviment i construcció d'animacions a React Native (`animate-expo`), estrès de components (`break-ui`), revisió de moviment | 15 skills de Markdown, sense scripts |
| [Impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) | Auditoria (`audit`), crítica UX (`critique`) i passada final (`polish`) | Descarrega un binari en el primer ús, verificat amb un *checksum* del seu repo |
| [Taste](https://github.com/Leonxlnx/taste-skill) (MIT) | Inspector de navegador per a l'admin web i les pàgines públiques | Cal Node 22+ i Chrome, Edge o Chromium; el seu estil de casa **no** s'aplica |

## Instal·lar

Comprova primer què tens: `node .agents/scripts/skills-de-tercers.mjs`. Les ordres exactes que et manquen les imprimeix ell mateix. Totes instal·len a nivell d'usuari (`~/.claude/skills`):

```bash
# Emil Kowalski (15 skills)
npx skills@latest add emilkowalski/skills -g -a claude-code -s "*" -y --copy

# Impeccable (sense hooks)
npx impeccable@latest install --yes --providers=claude --user --no-hooks

# Taste
npx skills@latest add https://github.com/Leonxlnx/taste-skill -g -a claude-code -s design-taste-frontend -y --copy
```

- **Impeccable amb `--no-hooks`**: sense els hooks de disseny, que s'executarien a cada edició. També instal·la quatre agents a `~/.claude/agents`.
- **Telemetria**: Impeccable en té d'anònima activada per defecte (no envia codi ni noms de projecte, segons el seu avís). Es desactiva amb `npx impeccable telemetry off` o la variable `IMPECCABLE_NO_TELEMETRY=1`. La CLI `skills` també pot enviar telemetria d'instal·lació; consulta'n la documentació.
- **Revisa abans d'instal·lar**: són instruccions i, en alguns casos, scripts que l'agent executa amb els teus permisos.
- Reinicia l'eina perquè les vegi. Pots comprovar-ho de nou amb l'script.

## Actualitzar i treure

- Emil i Taste: `npx skills update` · treure: `npx skills remove <nom>`.
- Impeccable: `npx impeccable update` i `npx impeccable check`. No té comanda per desinstal·lar: esborra `~/.claude/skills/impeccable`, els quatre `~/.claude/agents/impeccable-*.md` i, si vols, `~/.impeccable`.

## Com les fa servir l'agent

1. En obrir la sessió, el hook `SessionStart` diu quines hi són (`PERSEIDA_SKILLS_HINT=off` el silencia).
2. Si hi són, s'usen **sota el brief de «Frutiger Cosmo»**: el brief guanya sempre.
3. Tres són **manuals** (`/review-animations`, `/prototype`, `/pick-ui-library`): un agent no les pot invocar; si en vols el resultat, escriu-les tu. `/review-animations` és recomanable abans d'una PR que toqui moviment.
4. Les passades escriuen a `.taste-skill/`, `.impeccable/` i `plans/`, que són al `.gitignore`. Si apareix un `PRODUCT.md` o `DESIGN.md` a l'arrel (Impeccable), no es fusiona.

## Si una skill proposa una cosa que contradiu el disseny

No la facis. Per exemple, Taste vol treure el vidre i els gradients, Impeccable vol fer `init` i Emil suggereix `NativeTabs`. La taula de conflictes és a `skills-de-tercers.md`. Si hi ha dubte, pregunta a l'equip.
