---
titol: "Sessió 2026-11-23: esquelet i accessibilitat del panell, i publicació pel CD (TG-77, #587, #588 i #589)"
tipus: sessio
estat: vigent
data: "2026-11-23"
us: ["TG-77", "TG-587", "TG-588", "TG-589", "TG-590"]
font: "Taiga: US #77 i tasques #583-#590; PR #145, #146 i #155; codi a frontend/src/features/admin, .github/workflows/cd.yml i infra/scripts/install-admin-dist.sh"
etiquetes: [sessio, frontend, admin, infra, cd]
---

# Sessió 2026-11-23 · Esquelet del panell, accessibilitat i publicació pel CD

## Objectiu

Acabar la US TG-77 (SPA d'administració amb accés per rol): l'esquelet que veu un `admin` o `moderator`, la seva accessibilitat i els tres idiomes, i que el CD publiqui el paquet perquè `/admin/` deixi de donar 404.

## Què s'ha fet

- **Backend (#583 i #584, PR #145):** `require_role(*roles)` a `app/infrastructure/users/dependencies.py`: 401 sense sessió i 403 `INSUFFICIENT_ROLE` amb un altre rol; llegeix el rol de la base de dades a cada petició. TG-73 el pot reutilitzar.
- **Ruta i accés (#585 i #586, PR #146):** `experiments.baseUrl: "/admin"`, el guardià `AdminGate`, la pantalla «Sense accés» i el login web cap a `/panel` segons el rol. Detall a [[2026-11-23-tg-77-resposta-a-la-review]] i a [[frontend]].
- **Esquelet i accessibilitat (#587 i #588, PR #155):** `AdminShell`, `PanelHome`, la llista buida `PANEL_SECTIONS`, l'enllaç «Salta al contingut», les regions amb nom, l'avís `polite` i els textos en tres idiomes. Vegeu «Esquelet i accessibilitat (TG-77)» a [[frontend]].
- **Publicació (#589):** job `admin-bundle` al CD i `install-admin-dist.sh`, amb el test `test-admin-dist.sh` a la CI. Vegeu [[nginx-proxy-manager]].

## Decisions preses

Cap ADR nova.

- **Rutes del panell:** `src/app/(admin)/panel/`, perquè `(app)` i `(admin)` no poden tenir un `index` a la mateixa ruta.
- **Seccions futures:** llista buida `PANEL_SECTIONS` i targetes a l'inici, sense menú lateral de moment.
- **Disseny:** cel i llac sense la pluja de Perseides i una barra de vidre; missatge de benvinguda fix.
- **Accessibilitat:** sense límit d'escala del text, avís de «Sense accés» `polite` i enllaç de salt afegit ja.
- **Publicació del panell:** es compila en un job del CD abans de tocar el servidor i s'instal·la al volum amb un contenidor d'un sol ús de la imatge d'NPM, amb les mateixes variables públiques de GitHub que l'APK. `docker compose run -v` no serveix: el Compose conserva el muntatge de només lectura del servei.

## Canvis al vault

- [[frontend]]: secció «Esquelet i accessibilitat (TG-77, #587 i #588)».
- [[nginx-proxy-manager]]: l'estat d'implementació diu que el CD publica el panell.

## Pendent / següents passos

- [ ] Comprovar al navegador el focus visible dels botons compartits, el contrast sobre el pitjor fons i un lector de pantalla.
- [ ] Comprovar a producció, després del primer desplegament, que `/admin/` respon 200 i que les rutes internes tornen `index.html`.
- [ ] Comprovar que existeixen les variables de GitHub `EXPO_PUBLIC_API_BASE_URL` i `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- [ ] Procediment per fer el primer `admin` a producció (avui el rol es canvia a la base de dades).
- [ ] Una pantalla per canviar de rol només per a l'equip no és de TG-77: es proposa com a US nova (TG-78 la pot solapar).

## US de Taiga

- TG-77 (tasques #583 a #590)
