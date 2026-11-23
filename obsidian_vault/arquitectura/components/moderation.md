---
titol: "Component: moderation"
tipus: component
estat: vigent
data: "2026-11-20"
us: ["TG-85", "TG-37", "TG-81", "TG-101", "TG-64", "TG-470"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [component, moderation, kev-4b]
---

# moderation

## Responsabilitat

Microservei independent que executa localment el model de decisió Kev-4B. L'[[api]] el crida de manera síncrona abans de difondre qualsevol publicació o missatge de xat (amb el context previ de la conversa, en castellà, català o anglès). L'avaluació es fa en un sol pas endavant amb latència mínima i té tres resultats:

- infracció greu (odi o contingut sexual): el contingut s'elimina i el compte es bandeja immediatament;
- contingut fora de la temàtica de l'app: s'elimina i s'avisa preventivament l'usuari;
- qualsevol altre cas: se'n permet la difusió.

Executar-lo en local evita dependre d'un tercer i enviar-li contingut dels usuaris.

## Moderador provisional del xat (TG-64)

Mentre #81 no existeix, el xat d'esdeveniment ([[chat]]) ja crida el moderador a través del port `MessageModerator` (`app/domain/chat/ports.py`: `moderate(text) -> ModerationResult`). El seu únic adaptador és `ApproveAllModerator` (`app/infrastructure/chat/moderator.py`), que aprova tots els textos. El servei el crida després del límit de freqüència i abans de desar: un text no aprovat és `CHAT_MESSAGE_REJECTED` (422) i no es desa ni es difon.

Quan arribi #81, n'hi haurà prou amb un adaptador que implementi `MessageModerator` cridant aquest microservei per HTTP i amb canviar-lo a `get_chat_service` (`app/infrastructure/chat/dependencies.py`); ni `ChatService` ni els endpoints canvien. Pendent de #81: el context previ de la conversa, les accions sobre el compte (bandejar o avisar) i el comportament si el servei no respon. Decisió a [[0033-xat-per-esdeveniment-sala-missatge-i-flux]].

## Tecnologia i versió

Kev-4B (model local), imatge de versió fixada, amb límits de recursos i healthcheck. Config a `infra/moderation/` (estructura planificada). La versió concreta no consta als documents consultats.

## Interfícies

- Qui el crida: [[api]] (HTTP síncron).
- A qui crida: ningú. Només és accessible des de la xarxa interna de Docker.

## Configuració

Veure `.env.example`; no hi apareix cap variable específica d'aquest servei.

## Decisions relacionades

- [[0007-moderacio-local-kev-4b-sincrona]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]
- [[0033-xat-per-esdeveniment-sala-missatge-i-flux]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-81 (moderació Kev-4B)
- TG-101 (servei Kev-4B)
- TG-64 (xat d'esdeveniment: moderador provisional que aprova tot)

## Estat d'implementació

planificat (el servei Kev-4B; el xat usa mentrestant un moderador provisional que aprova tot, vegeu més amunt)

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]]
- [[api]], [[nginx-proxy-manager]], [[chat]]
