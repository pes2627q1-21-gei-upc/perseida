---
titol: Stakeholders de Perseida
tipus: producte
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: "incepció 2 §3 (List of stakeholders)"
etiquetes: [producte, stakeholders]
---

# Stakeholders de Perseida

Cinc grups, segons la segona incepció.

## D'ús

- **Usuari enfocat a la informació astronòmica**: consulta dades tècniques, el catàleg d'esdeveniments, l'APOD i les condicions meteorològiques i de contaminació lumínica.
- **Usuari enfocat a la comunitat i l'experiència social**: usa sales de xat i missatgeria directa, comparteix fotografies i participa en ràtxes i qüestionaris diaris.
- **Administradors i moderadors**: gestionen usuaris i contingut des del panell web, revisen denúncies, supervisen esdeveniments i mètriques, i apliquen suspensions.

## De tema

- **Agències espacials i institucions científiques (NASA, CNEOS)**: defineixen els estàndards científics i forneixen les dades primàries.
- **Associacions astronòmiques i entitats de divulgació**: validen el rigor astronòmic i defensen els cels foscos davant la contaminació lumínica.

## De tecnologia

- **Proveïdors d'APIs externes (NASA Open APIs, meteorologia, contaminació lumínica)**: condicionen la ingesta de dades amb quotes i rate limits (vegeu [[serveis-externs]]).
- **Serveis d'infraestructura externs (Google Identity, Firebase Cloud Messaging, servidor Virtech)**: autenticació, notificacions push i allotjament del backend.
- **Aplicacions partner (Spotwise)**: consumeix el nostre servei d'esdeveniments i ens proveeix la cerca de llocs de trobada; un canvi de contracte ens afecta mútuament (vegeu [[contracte-spotwise]]).

## De desenvolupament i metodologia

- **Equip de desenvolupament**: implementa l'app React Native, el backend FastAPI hexagonal i la persistència.
- **Scrum Master (rotatiu per sprint)**: facilita Scrum, elimina impediments i coordina les cerimònies.
- **Product Owner**: client del projecte; prioritza el backlog, dona feedback a les reviews i valida els increments.
- **Responsables de privacitat i compliment normatiu (RGPD)**: vetllen per les dades de geolocalització, la minimització de dades i els drets d'autor del material visual.

## Negatius i competidors

- **Apps competidores d'astronomia (Astrospheric, Sky Tonight, Star Walk 2, etc.)**: plataformes consolidades que volen retenir quota de mercat davant la integració vertical de Perseida.
- **Portals sensacionalistes i mitjans d'esdeveniments astronòmics**: exploten contingut clickbait i veuen amenaçat el seu trànsit davant d'una font científica.
- **Bots, spam i usuaris maliciosos**: intenten degradar la comunitat amb spam, publicitat o text inadequat (vegeu [[0007-moderacio-local-kev-4b-sincrona]]).

## Enllaços

- [[not-list]]
- [[epiques-i-us]]
- [[serveis-externs]]
- [[contracte-spotwise]]
