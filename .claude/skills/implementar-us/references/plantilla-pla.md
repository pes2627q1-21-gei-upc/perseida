# Plantilla del pla i de l'informe

Una pàgina com a màxim. Substitueix cada `<...>`; el que no aplica s'escriu «no aplica» amb motiu, no s'esborra.

## Pla (fase 5)

```markdown
# TG-<NN> · <títol de la US>

**Branca:** feature/<nom> · **Font:** <MCP de Taiga | claude-in-chrome | text enganxat>
**US en una frase:** Com a <rol> vull <funcionalitat> per a <benefici>.

## Criteris d'acceptació → canvi mínim
| # | Criteri (entrada · condició · resultat) | Ja es compleix? | Canvi mínim | Fitxers |
|---|---|---|---|---|
| 1 | <...> | <sí/no/parcial: on> | <el més petit que el fa passar> | <rutes> |

## Reutilitzem
<què hi ha ja (serveis, ports, components, tokens, hooks) i es fa servir>

## Qui fa què
| Part | Skill / subagent |
|---|---|
| <...> | <backend-service, frontend-pagina, estetica-frutiger-cosmo...> |

## Tests (després del codi, derivats dels criteris)
<criteri → test; quins queden exclosos de cobertura i per què>

## Vault
<ADR/arquitectura a actualitzar abans de fusionar, o «cap canvi d'arquitectura»> · Sessió + `estat-actual.md` al final.

## Decisions de disseny (si hi ha UI nova)
<element memorable · motiu natural · icones · sons (origen) — preguntats i resolts>

## Preguntes resoltes
<pregunta → resposta de la persona>

## No es farà (a propòsit)
<refactors, generalitzacions, dependències i extres descartats>

## Riscos
<el que pot sortir malament i com es detecta>

## Taiga (si s'escau; amb confirmació)
<subtasques/comentaris/estats que es proposen>

**Porta:** espero la teva aprovació abans d'escriure codi.
```

## Informe de verificació (fase 9)

```markdown
# Informe · TG-<NN>

## A. Criteris d'acceptació
| # | Criteri | Evidència | Resultat |
|---|---|---|---|
| 1 | <...> | <test `ruta::nom` o comprovació manual feta: què, on, com> | ✅/❌ |

## B. DoD verificable localment
| Comprovació | Ordre executada | Resultat real |
|---|---|---|
| Lint i tipus | `<ordre>` | <sortida resumida> |
| Tests | `<ordre>` | <passats/fallats> |
| Cobertura codi nou ≥ 70 % | `<ordre>` | <xifra> |
| Revisió `reviewer-arquitectura` | subagent | <troballes obertes> |
| Vault + sessió + estat-actual | — | <fitxers> |
| Sync skills/agents (si s'han tocat) | `--check` | <sortida> |

## Iteracions
<què va fallar, la causa i la correcció; cap test afeblit>

## Pendent humà (no marcat com a fet)
- [ ] PR oberta per la persona (cap push/PR fet per l'agent)
- [ ] Aprovada per algú que no sigui l'autora
- [ ] CI verda i Quality Gate de SonarQube Cloud (0 bugs/vulnerabilitats, duplicació ≤3 %, cobertura ≥70 %, hotspots revisats, qualificació A)
- [ ] Fusió a `develop`
- [ ] Subtasques tancades i US a `Done` a Taiga

## Decisions i desviacions
<què s'ha decidit i qui ho va aprovar; què s'ha desviat del pla i per què>
```

Només escrius «✅» o «passa» si has **executat** la comprovació i has vist la sortida. Si no s'ha pogut executar, ho dius.
