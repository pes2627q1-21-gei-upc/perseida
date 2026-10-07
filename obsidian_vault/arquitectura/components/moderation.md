---
titol: "Component: moderation"
tipus: component
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-37", "TG-81", "TG-101"]
font: "infra/README.md, memòria §3.4.1, incepció 2 §6"
etiquetes: [component, moderation, kev-4b]
---

# moderation

## Responsabilitat

Microservei independent que executa localment el model de decisió Kev-4B. L'[[api]] el crida de manera síncrona abans de difondre qualsevol publicació o missatge de xat (amb el context previ de la conversa, en castellà, català o anglès). L'avaluació es fa en un sol pas endavant amb latència mínima i té tres resultats:

- infracció greu (odi o contingut sexual): el contingut s'elimina i el compte es bandeja immediatament;
- contingut fora de la temàtica de l'app: s'elimina i s'avisa preventivament l'usuari;
- qualsevol altre cas: se'n permet la difusió.

Executar-lo en local evita dependre d'un tercer i enviar-li contingut dels usuaris.

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

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-81 (moderació Kev-4B)
- TG-101 (servei Kev-4B)

## Estat d'implementació

planificat

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]]
- [[api]], [[nginx-proxy-manager]]
