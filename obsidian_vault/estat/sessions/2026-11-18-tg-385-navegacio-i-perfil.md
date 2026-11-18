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
- **Merge de `develop`** (TG-628 i TG-629 ja fusionades): conflictes només a `locales/*.json` i al frontmatter de dues notes del vault, resolts mantenint les dues bandes. Calia per a la PR i perquè la BD local ja era a la migració de `posts`.
- **Errors trobats a la prova manual web** (responsable de la US), arreglats amb TDD:
  - Els botons «Obre el mapa d'esdeveniments» i «Imatge del dia» tornaven a l'inici: `href: null` a expo-router 58 treu la ruta del navegador. Ara les rutes amagades fan servir `tabBarButton: () => null`, amb un test de regressió amb el router real (els tests anteriors simulaven `push`).
  - Etiquetes de la barra tallades en vertical (la barra de 49 dp no hi cabia) i «Gamificati…» en apaïsat: etiqueta sempre sota la icona i alçada de la barra calculada amb tokens.
  - Les pantalles «Pròximament» no es podien desplaçar en finestres baixes: ara són un `ScrollView`.
  - `typography` passa de `Record<…, TextStyle>` a `satisfies`, per sumar alçades de línia amb tipus (només tipus, cap canvi en temps d'execució).
- **Prova a Android** (APK d'EAS `preview` contra el backend local per un túnel HTTPS): TalkBack llegeix les cinc pestanyes i el perfil. Error trobat i arreglat amb TDD: les pestanyes no ocupaven tota l'amplada perquè `map` i `apod`, tot i no tenir botó, conservaven el seu espai `flex: 1` a la barra. Ara també porten `tabBarItemStyle: { display: 'none' }`.

- **Review de la PR #106** (canvis demanats), atesa amb TDD:
  - La sessió del perfil té una sola font: `getUserProfile()` fa servir `authHeaders()` i el hook ja no llegeix els tokens ni crea l'`INVALID_SESSION` a mà.
  - La càrrega del perfil s'anuncia com a *live region* i l'error com a `alert` (WCAG 4.1.3), igual que `MapStatus` i `EventPosts`.
  - Una data d'alta invàlida ja no fa caure la pantalla (`RangeError` d'`Intl`): la línia «Membre des de» no surt.
  - Els dos `header` del perfil (títol de la pantalla i nom) es mantenen: són dos nivells de navegació per títols i TalkBack els llegeix bé.

- **Merge de `develop` per resoldre el conflicte de la PR #106:** l'únic conflicte era el resum d'estat de [[frontend]] (TG-93 hi deia que el login ja està traduït); es mantenen les dues bandes. TG-61 hi afegia la ruta `(app)/quiz`, que hauria sortit com a sisena pestanya: ara és a `HIDDEN_ROUTES`, amb un test que comprova que cada ruta del grup és pestanya o ruta amagada.
- **Segon merge de `develop`** (TG-448/TG-450 i TG-652): conflicte només a [[testing]], perquè `develop` el va desar amb salts de línia CRLF i tot el fitxer semblava diferent. Fusionat a mà: el frontmatter (`us` i `font`) amb les dues bandes, i la secció d'estils de Stryker de TG-385 després del punt de Stryker de `develop`, mantenint-ne els CRLF perquè el diff de la PR sigui només el contingut. No hi ha cap ruta nova al grup `(app)`.

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

- [x] Prova manual web (mòbil petit, apaïsat, idiomes, data d'alta, logout); tornar-la a passar després dels arreglaments.
- [x] Prova manual a dispositiu Android: TalkBack per les cinc pestanyes i el perfil. Tornar a comprovar l'amplada de la barra després de l'arreglament.
- [x] El botó de tancar sessió surt en català amb l'app en castellà: ho arregla TG-93 (#618, #620), ja fusionada a `develop`.
- [ ] El login web en local necessita CORS, que és TG-363 (PR #103, d'una altra persona): mentre no es fusioni, la prova web va amb un proxy local de proves (fora del repo).
- [ ] El test d'integració de `/users/me` no s'ha executat en local (el fixture buida la BD de desenvolupament): el cobreix la CI.
- [x] PR #106 cap a `develop`; CI i SonarQube Cloud en verd.
- [ ] Aprovació de la PR després de la review (pendent de VoiceOver a iOS, que cal fer amb un iPhone de l'equip).
- [ ] Subtasques #517, #519, #520 i #521 i la US a «Ready for test» a Taiga.

## US de Taiga

- TG-385 (tasques #388, #517, #518, #519, #520, #521)
- TG-93 (text del logout, fora d'abast d'aquesta US)
