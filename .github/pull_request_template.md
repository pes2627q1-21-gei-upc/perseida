## Resum
<!-- Explica breument què canvia i per què. -->

## Taiga
<!-- Inclou TG-<ref> al títol de la PR i indica la US o tasca relacionada. -->
- Referència: TG-

## Checklist (Definition of Done)
- [ ] Compleix els criteris d'acceptació de la US o tasca.
- [ ] Totes les subtasques implicades estan tancades.
- [ ] La PR ha estat aprovada com a mínim per una persona diferent de l'autora.
- [ ] La CI és verda (linters, format, tipus i tests; Quality Gate quan estigui disponible).
- [ ] Hi ha tests per al codi nou.

## Testing (TDD estricte, ADR-0028)
- [ ] Hi ha tests unitaris de tots els components modificats.
- [ ] Si toca persistència o serveis externs, hi ha test d'integració (serveis reals, `respx`/stubs per als externs).
- [ ] Si és un bug, hi ha un test de regressió que el reprodueix.
- [ ] L'historial mostra el commit `test:` (en vermell) abans del `feat:`/`fix:` corresponent.
- [ ] Cobertura: 80 % global i 90 % del codi nou (la CI de la PR ho exigirà quan s'implanti; mentre tant, comprovada en local).
- [ ] Si toca el domini, mutation testing sobre els fitxers canviats amb score >= 70 % (o anotat com a pendent si l'eina encara no és instal·lada).

## Resta de la DoD
- [ ] El codi respecta l'arquitectura hexagonal i les convencions de nomenclatura.
- [ ] Les consultes a PostgreSQL/PostGIS són eficients.
- [ ] No s'han introduït secrets ni credencials al codi ni al vault.
- [ ] S'han revisat els avisos de SonarQube Cloud, si escau.
- [ ] Si la US canvia l'arquitectura o pren una decisió rellevant, el vault d'Obsidian està actualitzat (`obsidian_vault/`).
- [ ] Les notes del vault s'han escrit seguint les skills d'Obsidian (`.agents/skills`).

## Assistents d'IA
- [ ] No s'ha fet servir cap assistent.
- [ ] S'ha fet servir un assistent a: <!-- Indica les parts concretes; l'autora n'és responsable i ho sap explicar. -->
