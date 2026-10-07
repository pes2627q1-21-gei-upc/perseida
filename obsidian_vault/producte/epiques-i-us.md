---
titol: Èpiques i històries d'usuari
tipus: producte
estat: vigent
data: 2026-10-07
us: ["TG-85"]
font: "incepció 2 §4; memòria §2.1; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [producte, epiques, us, taiga]
---

# Èpiques i històries d'usuari

El backlog es gestiona a Taiga: <https://tree.taiga.io/project/alexga03-astronomia-pes>. Aquesta nota només en deixa una còpia de referència; no la mantinguis en paral·lel.

> [!warning] L'estat i l'agrupació viuen a Taiga
> L'estat de cada US (New, Ready, In progress, Done) i la seva pertinença a una èpica són a Taiga, no al vault. La taula d'èpiques i US de la incepció 2 no és fiable per deduir quina US va a quina èpica, així que aquí no s'assigna. Per a l'estat en una data, vegeu [[estat-actual]].

## Èpiques

Segons la incepció 2 §4 i la memòria §2.1:

**Infraestructura i base tècnica**
1. Plataforma tècnica i monorepo
2. Integració contínua i desplegament
3. Nucli del backend: arquitectura hexagonal i API
4. Identitat, comptes i seguretat

**Funcionalitat de producte**

5. Esdeveniments astronòmics: catàleg i mapa
6. Contingut diari de la NASA (APOD)
7. Gamificació: ràtxes, fites i quiz diari
8. Comunitat i missatgeria en temps real
9. Recomanació d'observació geoespacial i meteorològica
10. Notificacions i integració amb el dispositiu

**Transversals**

11. Administració i moderació
12. Qualitat, testing i documentació
13. Internacionalització: català, castellà i anglès

Etiquetes de Taiga per filtrar el tauler: `backend`, `devops`, `documentation`, `frontend`, `testing`.

## Backlog de Taiga (llistat llegit el 2026-10-07)

| Ref | Títol |
|---|---|
| TG-30 | Estructura del monorepo amb els quatre directoris i guia d'arrencada |
| TG-31 | Configuració del projecte backend Python amb gestor de dependències, linter i type checker |
| TG-32 | Configuració del projecte frontend React Native + TypeScript amb ESLint, Prettier i Tailwind |
| TG-33 | Convencions de branques, commits i plantilla de pull request |
| TG-34 | Workflow de CI que executa lint i tests del backend a cada push i pull request |
| TG-35 | Workflow de CI que executa lint i tests del frontend a cada push i pull request |
| TG-36 | Construcció i publicació de la imatge Docker del backend a GHCR |
| TG-37 | Docker Compose amb els cinc serveis (nginx-proxy-manager, api, postgres+PostGIS, redis, moderation) per a local i producció |
| TG-38 | Desplegament automàtic al servidor de Virtech per SSH renderitzant el .env des dels secrets de GitHub |
| TG-39 | Esquelet de l'aplicació FastAPI async amb les capes domain, application i infrastructure |
| TG-40 | Connexió async a PostgreSQL amb SQLModel i gestió del cicle de vida de les sessions |
| TG-41 | Configuració d'Alembic, primera migració i execució automàtica a l'entrypoint del contenidor |
| TG-42 | Documentació Swagger/OpenAPI publicada i sempre sincronitzada amb l'API |
| TG-43 | Inici de sessió amb Google OAuth2 i PKCE des de l'app mòbil |
| TG-44 | Validació de tokens de Google via JWKS i emissió de sessió pròpia al backend |
| TG-45 | Model d'usuari, alta automàtica al primer accés i tancament de sessió |
| TG-46 | Obtenció sota demanda de l'APOD des de la NASA amb cache a Redis i persistència a PostgreSQL |
| TG-47 | Endpoint de consulta de l'APOD del dia i de l'històric |
| TG-48 | Pantalla de l'APOD del dia a l'app mòbil |
| TG-49 | Gestió centralitzada d'errors, logging estructurat i healthcheck |
| TG-50 | Obtenció sota demanda i normalització d'esdeveniments des de les APIs externes amb cache a Redis |
| TG-51 | Llistat filtrable per tipus, data i proximitat |
| TG-52 | Mapa interactiu d'esdeveniments actius i futurs |
| TG-53 | Subscripció i baixa d'un esdeveniment |
| TG-54 | Trajectòria i risc d'asteroides propers amb NASA/CNEOS (consulta sota demanda amb cache) |
| TG-55 | Fitxa de dades tècniques i explicació física d'un esdeveniment |
| TG-56 | Registre diari i càlcul de ràtxes consecutives en temps de consulta |
| TG-57 | Visualització de la ràtxa a l'app |
| TG-58 | Motor de fites desbloquejables per activitat |
| TG-59 | Pantalla de fites i compartició a xarxes externes |
| TG-60 | Generació sota demanda del quiz diari d'astrofísica en català, castellà i anglès amb cache a Redis |
| TG-61 | Pantalla del quiz diari i resultats |
| TG-62 | Seguiment i deixar de seguir usuaris |
| TG-63 | Endpoint WebSocket integrat a l'API amb Redis pub/sub |
| TG-64 | Sales de xat col·lectives per esdeveniment amb històric persistent |
| TG-65 | Xat directe 1-a-1 amb històric persistent |
| TG-66 | Cua offline SQLite i sincronització last-write-wins |
| TG-67 | Votació comunitària de la millor fotografia enviada per esdeveniment |
| TG-68 | Publicacions multimèdia efímeres de 24 hores amb purga programada |
| TG-69 | Integració sota demanda d'APIs de meteorologia i contaminació lumínica amb cache a Redis |
| TG-70 | PostGIS i consultes geoespacials de zones d'observació |
| TG-71 | Algorisme de puntuació i recomanació de zones òptimes |
| TG-72 | Pantalla de zones d'observació recomanades |
| TG-73 | Integració amb FCM i registre de tokens de dispositiu |
| TG-74 | Preferències de notificació per tipus, data i proximitat |
| TG-75 | Enviament de notificacions d'esdeveniments amb el planificador intern |
| TG-76 | Exportació d'esdeveniments al calendari natiu en format iCalendar |
| TG-77 | SPA d'administració amb React Native Web i accés per rol |
| TG-78 | Gestió d'usuaris i suspensió de comptes |
| TG-79 | Supervisió d'esdeveniments publicats i mètriques d'ús |
| TG-80 | Denúncies de contingut i cua de revisió |
| TG-81 | Moderació síncrona amb Kev-4B al flux de publicació i xat (un sol pas, català, castellà i anglès) |
| TG-82 | Base de tests unitaris del backend amb pytest async |
| TG-83 | Base de tests de components del frontend amb Jest i Testing Library |
| TG-84 | Tests d'integració de l'API amb base de dades efímera |
| TG-85 | Obsidian Vault amb context d'arquitectura i decisions per a agents d'IA |
| TG-87 | Configuració de Redis com a cache amb TTL (patró lazy) i pub/sub per al WebSocket |
| TG-88 | Planificador de tasques APScheduler integrat al procés de FastAPI |
| TG-89 | Configuració de nginx-proxy-manager com a punt d'entrada HTTPS amb upgrade WebSocket i servei d'estàtics |
| TG-91 | Infraestructura i18n al frontend amb i18next, detecció de l'idioma del dispositiu i fallback |
| TG-92 | Selector d'idioma i persistència de la preferència a l'usuari |
| TG-93 | Traducció de tots els textos de l'app mòbil a català, castellà i anglès |
| TG-94 | Localització de missatges d'error i notificacions push del backend segons l'idioma de l'usuari |
| TG-95 | Traducció del panell d'administració a català, castellà i anglès |
| TG-96 | Pujada de fitxers multimèdia a un volum local del servidor, servits per nginx-proxy-manager |
| TG-97 | Minijoc d'astronomia per reptar amics amb la puntuació registrada a l'històric del xat |
| TG-101 | Microservei de moderació Kev-4B al Docker Compose amb model local, healthcheck i límits de recursos |
| TG-102 | Baneig immediat de compte per infracció greu d'odi o contingut sexual |
| TG-103 | Esborrat de contingut fora de temàtica amb avís preventiu a l'usuari abans de difondre'l |
| TG-104 | Avaluació de Kev-4B amb un conjunt de prova en català, castellà i anglès |

> [!note] Números que falten
> El llistat no incloïa les referències 86, 90 i 98-100. No s'hi assigna cap US (per exemple, les de SonarQube Quality Gate o altres de la incepció 2 poden ser-hi amb altres números o estar arxivades). Consulta Taiga.

## Enllaços

- [[not-list]]
- [[stakeholders]]
- [[estat-actual]]
- [[definition-of-done]]
