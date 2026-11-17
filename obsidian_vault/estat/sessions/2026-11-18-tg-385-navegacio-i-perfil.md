---
titol: "Sessió 2026-11-17/18: navegació per pestanyes i perfil d'usuari (TG-385)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-385", "TG-93", "TG-91"]
font: "Taiga: TG-385 (tasques #388, #517-#521), TG-91 i TG-93; revisió de reviewer-arquitectura; Stryker i diff-cover en local; decisions del responsable de la US en aquesta sessió"
etiquetes: [sessio, frontend, navegacio, perfil, accessibilitat, mutation]
---

# Sessió 2026-11-17/18 · Navegació per pestanyes i perfil (TG-385)

## Objectiu

Acabar TG-385: barra de cinc pestanyes, pantalles «Pròximament» i perfil amb dades reals, complint tots els criteris, la DoD i l'arquitectura.

## Què s'ha fet

- **Sincronització:** merge de `develop` a la branca (sense conflictes).
- **Data d'alta (criteri 3):** `GET /api/users/me` retorna `created_at` (només el DTO `UserResponse` de l'adaptador; el domini ja el tenia). OpenAPI i `schema.d.ts` regenerats. El perfil mostra «Membre des de …» amb `Intl.DateTimeFormat` en l'idioma actiu.
- **Slots (criteri 4):** el tercer és «Seguidors» (#62). Els tres slots són un `ProfileSlot` local i porten el mateix badge «Pròximament» que les pantalles pendents (`comingSoon.badge`).
- **Tests a `features/profile/__tests__/` (criteri 8)** i test del logout des del perfil.
- **Accessibilitat (criteri 6):** pestanyes de 48 dp mínim també en apaïsat (React Navigation compacta la barra a 32 px), etiquetes traduïdes, avatar decoratiu ocult al lector. Contrast mesurat amb `contrast.py` als quatre temes (el pitjor cas, 4,73:1 a posta).
- **Revisió de `reviewer-arquitectura`**, totes les troballes ateses:
  - **Seguretat (ALTA):** l'avatar passa per `safeHttpsUrl` ([[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]]) i torna a les inicials si la foto no carrega.
  - Sense nom de perfil, l'encapçalament és el correu; un rol o un idioma que l'app no coneix no es mostra en cru.
  - Claus i18n mortes esborrades i «ratxa» corregida.
  - Tokens del tema en lloc de valors escrits a mà; l'etiqueta de la barra fa servir `typography.caption`.
  - Espai per a la barra flotant amb `useTabBarInset()` (alçada real de la barra) en lloc de `+80`/`+96`, també a l'inici temporal.
  - `profile/index.ts` ja no re-exporta `LogoutButton`.
- **Mutation testing:** els estils dels components queden fora de Stryker amb `createStyles` i `// Stryker disable all` (convenció nova a [[testing#Estils visuals als components del frontend (TG-385)]]). Resultat en local: Stryker 87,92 % (llindar 70 %), cobertura del codi nou 100 % i global 97 %. Els supervivents que queden són de la lògica de sessió del layout (TG-43) i de constants de temps.
- Detall de la navegació a [[frontend#Navegació per pestanyes i perfil (TG-385)]].

## Decisions preses

Cap ADR nova. Decisions del responsable de la US:

- `created_at` s'exposa a `UserResponse` per complir el criteri 3.
- El tercer slot és «Seguidors» i els tests de profile van a `__tests__/`, tal com diuen els criteris.
- L'avatar és decoratiu (ocult al lector), no etiquetat: el nom ve just després (WCAG 1.1.1).
- **El text del botó de tancar sessió no es tradueix aquí.** És feina de TG-93 (criteri 2, tasques #618 i #620), tal com va decidir TG-91 el 23/10/2026. Es va traduir per error i es va desfer abans de pujar-ho.
- Els estils visuals s'exclouen de Stryker; la lògica dels components es continua mutant.

## Canvis al vault

- [[frontend]]: secció «Navegació per pestanyes i perfil (TG-385)», resum d'estat i accés al mapa.
- [[testing]]: exclusió dels estils de Stryker.
- Aquesta sessió.

## Pendent / següents passos

- [ ] Prova manual a dispositiu: TalkBack/VoiceOver per les cinc pestanyes i el perfil, apaïsat (48 dp), mòbil petit i tauleta.
- [ ] El test d'integració de `/users/me` no s'ha executat en local (el fixture buida la BD de desenvolupament): el cobreix la CI.
- [ ] PR cap a `develop`, revisió d'una altra persona, CI i Quality Gate de SonarQube Cloud.
- [ ] Subtasques #517, #519, #520 i #521 i la US a «Ready for test» a Taiga.

## US de Taiga

- TG-385 (tasques #388, #517, #518, #519, #520, #521)
- TG-93 (text del logout, fora d'abast d'aquesta US)
