---
titol: "TG-657: frontmatter de les notes d'error fora de la convenció"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-657"]
font: "Review de la PR #137"
fase: review
capa: vault
regressio:
commit:
llico: convencio
etiquetes: [error-testing]
---

# TG-657: frontmatter de les notes d'error fora de la convenció

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

La plantilla `error-de-testing` i la primera nota d'error feien servir `tipus: error-testing` i `estat: obert|corregit`, que [[notes-obsidian]] no admetia, i no tenien el camp `font`.

## Causa

Es va crear un tipus de nota nou sense llegir el frontmatter estàndard de [[notes-obsidian]], que és la llista tancada de valors.

## Correcció

[[notes-obsidian]] admet el `tipus` `error-testing` i, només per a aquest tipus, els `estat` `obert` i `corregit` (com ja feia amb els ADR). S'ha afegit `font` a la plantilla i a la nota. Els noms de fitxer del registre passen a minúscules (`AAAA-MM-DD-tg-nn-resum`), per complir el kebab-case.

## Test de regressió

No es pot automatitzar: cap script valida el frontmatter del vault. Ho comprova el revisor amb la llista de [[notes-obsidian]].

## Lliçó

[[notes-obsidian]] diu ara que un `tipus` o un `estat` nou s'hi afegeix abans de crear-ne la primera nota.
