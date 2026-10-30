---
titol: "Sessió 2026-10-30: planificació de l'Sprint 2"
tipus: sessio
estat: vigent
data: "2026-10-30"
us: ["TG-49", "TG-50", "TG-51", "TG-52", "TG-53", "TG-56", "TG-57", "TG-58", "TG-59", "TG-60", "TG-61", "TG-63", "TG-64", "TG-65", "TG-92", "TG-93", "TG-101", "TG-194", "TG-329", "TG-338", "TG-343", "TG-351", "TG-352", "TG-359", "TG-360", "TG-362", "TG-363", "TG-385", "TG-386"]
font: "Taiga (Sprint 2, Sprint 3 i backlog, 30/10/2026); informe de l'Sprint 1 (Oriol, 29/10); sessió de planificació prèvia del 28/10 a classe; develop a 4a97f78"
etiquetes: [sessio, planificacio, sprint-2, scrum]
---

# Sessió 2026-10-30 · Planificació de l'Sprint 2

## Objectiu

Repartir l'Sprint 2 (29/10–29/11) amb punts equitatius, US relacionades per persona i el mínim de bloquejos entre persones, i deixar l'Sprint 3 (30/11–18/12) en una mida realista per acabar el projecte. SM de l'Sprint 2: Manel.

## Què s'ha fet

- **Capacitat:** ritme de l'Sprint 1 de 8,4 SP per dia natural (201 SP en 24 dies). Sprint 2 ≈ 269 SP (32 dies), Sprint 3 ≈ 160 SP (19 dies). Quedaven ≈ 574 SP: no hi cabia tot.
- **Ordre per dependències:** a l'Sprint 2 van les bases que desbloquegen altres US (#50 esdeveniments, #63 WebSocket, #56 ràtxes, #60 quiz, #385 navegació, #101 Kev-4B); a l'Sprint 3, el que s'hi recolza (#71/#72, #75/#76, #78–#80, #81, #95, #97, #361).
- **Reserva amb propietari:** #73 FCM i #386 (Oriol), #69 meteorologia (Manel), #70 zones (Raquel) i #77 admin (Simona). No depenen de res i són les arrels de les cadenes de l'Sprint 3; qui acaba les seves US agafa la seva reserva.
- **Única dependència entre persones:** #50 → #351 i #52 (Raquel). Tasca #387: contracte de l'esdeveniment (DTO + OpenAPI) en dos dies, i Raquel treballa amb mocks.

| Persona | US de l'Sprint 2 | SP | Reserva |
|---|---|---|---|
| Manel (SM) | #50, #51, #53, #343, #363, #49 | 45 | #69 |
| Raquel | #52, #351, #352 | 46 | #70 |
| Oriol | #63, #64, #65, #360 | 52 | #73, #386 |
| Simona | #56, #57, #58, #59, #92 | 47 | #77 |
| Xavi | #60, #61, #93, #329 | 47 (41 reals) | — |
| Alex | #194, #338, #359, #362, #101, #385 | 46 | — |

## Decisions preses

- **Fora de l'Sprint 2:** #66 offline al backlog (no és YES a la [[not-list]]; [[0011-client-offline-sqlite-last-write-wins]] queda sense implementar si no s'hi torna); #361 i #62 a l'Sprint 3; #97 entra a l'Sprint 3.
- **Fusions (US arxivades amb comentari):** #94 → #75 (push en l'idioma de l'usuari; els errors ja es tradueixen al frontend, [[0018-errors-rfc-9457-amb-codis-estables]]); #102 i #103 → #81 (els tres resultats del flux de moderació, [[0007-moderacio-local-kev-4b-sincrona]]); #104 → #101.
- **#101 Kev-4B a l'Sprint 2** amb un spike de viabilitat a la VM: és el risc tècnic més gran.
- **#82, #83 i #84 tancades:** la base de tests ja existeix (fetes dins de cada US de l'Sprint 1). La política nova és a [[0028-tdd-estricte-i-politica-de-testing-avancada]] i s'automatitza a #359–#362; la #359 va la primera setmana.
- **US noves:** #385 navegació principal i perfil (no és el panell de configuració de perfil, que és NO); #386 còpia de seguretat abans de migrar ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]] ho havia deixat per a més endavant).
- **Toast** com a criteri de #57 (pendent des de TG-91, [[0018-errors-rfc-9457-amb-codis-estables]]).
- **#77:** el CD ha d'omplir `admin_dist` ([[0009-nginx-proxy-manager-serveix-media-i-spa-admin]]).
- **Bloquejos corregits:** #53 (#50), #93 (cap), #75 (#50, #73, #74), #81 (#64, #101), #97 (#62, #65).
- **Dates límit:** totes les US de l'Sprint 2 amb PR oberta el 22/11; la setmana del 23 al 29/11 és només per a revisions, correccions i la release. Abans: tasca #387 (contracte) el 2/11, tasca #388 (esquelet de pestanyes de #385) i #359 el 6/11. La primera setmana és d'exàmens: només s'hi demana el que bloqueja altres persones.
- La `release/*` per reconciliar `main` i `develop` és feina de l'SM, sense US (AGENTS.md).
- L'ADR d'Android de la tasca #334 ha de ser la 0029 (0027 i 0028 ja existeixen).

## Canvis al vault

- Aquesta nota.

## Pendent / següents passos

- [x] Punts a la web de Taiga: #49 → 3, #338 → 3, #343 → 5, #363 → 3, #101 → 16, #81 → 20, #75 → 16, #385 → 8, #386 → 3; #82, #83 i #84 → 0.
- [ ] Cada persona escriu subtasques, criteris i data límit de les seves US el primer dia.
- [ ] Contracte de l'esdeveniment (#387) abans del 31/10.
- [ ] `release/*` de l'Sprint 2 per reconciliar `main` i `develop` (SM).
- [ ] Revisió de la NOT-List amb l'equip: què cau primer si l'Sprint 3 va tard (#97, #79, #95, #361).
- [ ] Sprint 3 ≈ 164 SP si la reserva es fa a l'Sprint 2.

## US de Taiga

- Sprint 2: TG-49, TG-50, TG-51, TG-52, TG-53, TG-56, TG-57, TG-58, TG-59, TG-60, TG-61, TG-63, TG-64, TG-65, TG-92, TG-93, TG-101, TG-194, TG-329, TG-338, TG-343, TG-351, TG-352, TG-359, TG-360, TG-362, TG-363, TG-385
- Reserva: TG-69, TG-70, TG-73, TG-77, TG-386
