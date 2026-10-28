---
name: implementar-us
description: Porta una US o tasca de Taiga (enllaç, TG-NN o #ref) de cap a cap - la llegeix (MCP de Taiga), pregunta el que no se sap, planifica amb criteri d'enginyer sènior que prefereix la solució simple, espera aprovació, implementa amb les skills i subagents del repo i itera fins que els criteris d'acceptació i la DoD verificable passen. Usa-la quan la persona doni una US/tasca de Taiga per fer, planificar o implementar.
---

# Implementar una US de Taiga

Reps una referència a una US o tasca de Taiga i la portes fins que està **verificada**. Treballes com un enginyer sènior cansat: has vist massa codi innecessari i només vols el canvi més petit que compleixi els criteris d'acceptació. La persona és responsable de tot el codi que s'hi fusiona (AGENTS.md): el pla ha de poder explicar-lo.

Segueix `AGENTS.md` i la skill `vault-context`. Aquesta skill orquestra; no substitueix les skills de domini.

## Criteri de l'enginyer sènior (decideix tot el pla)

1. **El codi més barat és el que no s'escriu.** Abans de planificar, pregunta-te si el criteri ja es compleix, si ja hi ha codi que ho fa o si es pot resoldre amb configuració.
2. **Cerca abans d'escriure.** Reutilitza el que hi ha (serveis, ports, components, tokens, hooks). Un duplicat és un defecte.
3. **La simplicitat va dins de l'arquitectura, no contra ella.** Capes hexagonals, ports, errors RFC 9457, tokens de tema, etc. (ADR 0016–0021) es respecten. No es «simplifica» saltant-se-les ni se n'inventen de noves.
4. **Res «per si de cas».** Cap flag, paràmetre, abstracció o configurabilitat que cap criteri demani. No abstraguis fins al tercer cas real.
5. **Diff petit.** Un criteri → el canvi mínim que el fa passar. Cap refactor ni neteja aliena a la US.
6. **Una dependència nova és l'últim recurs** i sempre es pregunta (regla 7 d'AGENTS.md; versió fixada i existència verificada).
7. **Plans d'una pàgina.** Si el pla toca més fitxers o capes del que la US justifica, retalla'l i torna-ho a mirar.
8. **Els tests surten dels criteris** (ADR-0019: després del codi). No es fan tests per fer volum de cobertura.

## Protocol de dubtes (OBLIGATORI)

**No inventis ni suposis res.** Tot el que no sàpigues i no puguis llegir al vault, al codi o a la US, ho **preguntes a la persona** (eina de preguntes; agrupa-les, amb opcions i la teva recomendació). Sobretot: criteris ambigus, contracte d'API absent, valors de disseny «a validar», dependències, decisions d'arquitectura, ubicació/permisos, origen de sons i llicències. Un subagent que no pot preguntar retorna un bloc `PREGUNTES PER A L'HUMÀ`: el reculls i el planteges.

## Fases

### 1. Obtenir la US de Taiga

Projecte: `alexga03-astronomia-pes` (https://tree.taiga.io/project/alexga03-astronomia-pes). La referència pot ser una URL, `TG-NN`, `#NN` o un número.

1. **Si l'MCP de Taiga és disponible** (eines `taiga-mcp`; a Claude Code `mcp__taiga-mcp__*`): resol la referència (`resolveRef` amb projecte + ref), llegeix la US (`getUserStory`), les subtasques (`listTasks`), els comentaris (`listComments`) i els adjunts (`listAttachments`). Una referència pot ser una tasca o una issue: comprova el tipus abans.
2. **Si no hi és**, pregunta a la persona, amb opcions:
   - **Instal·lar-lo** (recomanat): paquet `@elio9352/taiga-mcp-server`, **a nivell d'usuari i lligat a aquest repo**, mai al repo. Guia i ordres a `references/taiga-mcp.md`. **Les credencials les escriu la persona al seu terminal**; tu no les demanes pel xat, no les llegeixes ni les escrius a cap fitxer, i no uses el prefix `!` (quedarien a la sessió).
   - **`claude-in-chrome`** per llegir la US a la web de Taiga (skill `claude-in-chrome`; cal tenir la sessió oberta).
   - **Que la persona enganxi el text** de la US (títol, descripció, criteris, subtasques).
3. **Taiga falla o no troba la referència?** No endevinis: digues què ha passat i torna a preguntar.
4. Mostra un resum de 5–8 línies de la US tal com l'has entesa i confirma-ho si hi ha el menor dubte. Indica l'**estat**, l'**assignació**, les subtasques ja tancades i la data límit; si la US està assignada a una altra persona o hi ha subtasques tancades, **avisa-ho i pregunta** abans de continuar (pot ser feina ja feta o d'una altra persona).

### 2. Context

Skill `vault-context`: `obsidian_vault/00-index.md`, ADR vigents que toquin l'àrea, `arquitectura/` (backend hexagonal, frontend), `convencions/` (testing, qualitat, DoD). Després, el **codi existent** (cerca, no suposis): què ja fa part de la US, què es pot reutilitzar. Les ordres de lint, tipus i tests són als README de `backend/` i `frontend/`; no les suposis.

### 3. DoR

Comprova la US contra la Definition of Ready (`obsidian_vault/convencions/definition-of-done.md`): format «Com a [rol] vull [funcionalitat] per a [benefici]», criteris d'acceptació **verificables** (entrada, condició, resultat esperat) i subtasques. El que falti o sigui ambigu **es pregunta**; no es completa en silenci. Si no es pot complir, proposa-ho com a comentari a Taiga (fase 6) i atura't fins a tenir resposta.

### 4. Preguntes

Totes les que apareguin, **abans del pla**, agrupades. No avancis amb una suposició.

### 5. Pla (una pàgina) i porta d'aprovació

Escriu el pla amb `references/plantilla-pla.md`: criteris → canvi mínim → fitxers; qui ho fa; tests; impacte al vault; riscos; què **no** es farà.

**Qui fa què (reutilitza, no reinventis):**

| Part de la US | Skill / subagent |
|---|---|
| Entitat/agregat de domini | `backend-entitat-domini` |
| Port (Protocol/ABC) | `backend-port` |
| Cas d'ús (service) | `backend-service` |
| Adaptador (repositori, client extern, router, WebSocket) | `backend-adaptador` |
| Errors, codis, toasts | `gestio-errors` |
| Component de UI | `frontend-component` |
| Pantalla / ruta | `frontend-pagina` |
| Formulari | `frontend-formulari` |
| Crida a l'API | `frontend-crida-api` |
| Joc, quiz, gamificació, animació | `frontend-jocs-dinamics` |
| **Qualsevol cosa visual** | `estetica-frutiger-cosmo` (que orquestra `frontend-design` i `ui-ux-pro-max`) |
| Docker, CI/CD, desplegament | subagent `devops` |
| Tests un cop hi ha codi | subagent `qa-tester` |
| Revisió abans de lliurar | subagent `reviewer-arquitectura` |
| Vault | `obsidian-markdown` (`obsidian-bases` per a `.base`, `json-canvas` per a `.canvas`) |

Subagents especialitzats: `backend`, `frontend`, `devops`. **Si la part visual de la US té aspecte nou, el pla inclou les decisions de disseny que calgui preguntar** (element memorable, motiu natural, icones, sons).

> **PORTA:** presenta el pla a la persona i **espera la seva aprovació explícita**. No escriguis ni una línia de codi abans. Si el canvia, actualitza'l i torna-ho a presentar.

### 6. Escriptura a Taiga (opcional, sempre amb confirmació)

Permesa: crear subtasques (`createTask`), comentar (`addComment`) i canviar estats (`updateTask`, `updateUserStory`). **Abans de cada escriptura (o lot), mostra exactament què es farà i espera un sí.** Mai en silenci. Estats vàlids a la DoD: subtasques NEW, IN PROGRESS, READY FOR TEST, CLOSED, NEEDS INFO; US New, Ready, In progress, Ready for test, Done, Archived.

Límit: **no moguis mai la US a `Done`** (requereix PR aprovada per una altra persona i fusionada; és de la persona). Pots proposar fins a `Ready for test`. Si has proposat una subtasca perquè la US no complia el DoR, deixa-ho clar al comentari.

### 7. Implementar

- Treballa a `feature/*` (GitFlow; màxim una US per branca). **No treballis a `main`, `develop`, `release/*` ni `hotfix/*`.** Si ets en una altra branca, pregunta.
- Delega als subagents/skills de la taula; cada skill porta el seu propi protocol de dubtes i la seva checklist.
- Commits atòmics `TG-NN tipus(àmbit): resum`, un canvi lògic per commit, seguint les instruccions de la persona sobre l'atribució. **Si no saps el `TG-NN`, pregunta-ho.** Cap secret, `.env`, token ni dada personal (regla 6).
- **Mai push, merge ni PR** si la persona no ho demana explícitament.
- Si canvia l'arquitectura o es pren una decisió rellevant, actualitza el vault **abans** de fusionar (DoD), amb `obsidian-markdown`.

### 8. Verificar i iterar fins que tot sigui verd

Dos portes, les dues han de passar:

**A. Criteris d'acceptació.** Taula `criteri → evidència` (test que el cobreix, o comprovació manual descrita i feta). Cada criteri té una evidència; si no en té, no està complet. Els criteris visuals es passen amb `estetica-frutiger-cosmo/references/checklist.md` (amb el reforç opcional de les skills de tercers si són instal·lades; si no ho són, no és motiu de bloqueig).

**B. DoD verificable localment.**
- Lint, tipus i tests als directoris tocats (ordres dels README); cap test en vermell.
- Cobertura del codi nou ≥ 70 % i Quality Gate local raonable: 0 bugs/vulnerabilitats, duplicació ≤ 3 % (`convencions/qualitat.md`).
- `reviewer-arquitectura` sobre el diff: cap troballa CRÍTICA ni ALTA oberta.
- Vault actualitzat si cal; entrada a `obsidian_vault/estat/sessions/` (regla 4).
- Si tens tocat skills o subagents: `node .agents/scripts/sync-skills.mjs` i `node .agents/scripts/sync-agents.mjs` (i els `--check`).

**Itera:** si alguna porta falla, corregeix la causa (no el símptoma) i repeteix **les dues**. Si el mateix punt falla tres cops, **atura't i pregunta**: no martellegis. No afebleixis un test ni un criteri per fer-lo passar.

### 9. Informe final

Amb `references/plantilla-pla.md` (secció informe):
- **Verd:** criteris amb evidència i DoD verificable amb el resultat real de cada ordre. Només dius «passa» si ho has executat i has vist la sortida.
- **Pendent humà (checklist explícita, mai marcada com a feta):** PR oberta, aprovada per una persona que no sigui l'autora, CI i SonarQube Cloud Quality Gate, fusió a `develop`, subtasques tancades a Taiga, `Done`.
- Decisions preses (i qui les va aprovar), desviacions del pla i què s'ha deixat fora a propòsit.

## Què NO fer

- No inventis ni suposis criteris, camps d'API, valors de disseny ni dades de Taiga.
- No demanis, llegeixis ni escriguis credencials; no les posis al repo, al vault ni al xat.
- No escriguis a Taiga sense confirmació; no moguis la US a `Done`.
- No implementis abans de l'aprovació del pla.
- No sobreenginyeris: cap abstracció, flag ni dependència que cap criteri demani.
- No facis push, merge ni PR sense que la persona ho demani; no treballis fora de `feature/*`.
- No editis `.claude/skills/` ni els subagents generats; la font és `.agents/`.
