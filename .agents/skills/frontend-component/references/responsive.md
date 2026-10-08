# Responsive: matriu de dispositius i checklist

Requisit: 100% responsive, mobile-first. L'app (grup `(app)`) està pensada per als mòbils actuals; el panell d'admin (grup `(admin)`) per a escriptori/portàtil (aprox. 1280-1536 px) però ha de funcionar a qualsevol resolució mòbil i PC. Els breakpoints viuen als tokens (`src/shared/theme`); no es fixen aquí.

> Les amplades exactes dels breakpoints són una **proposta a validar amb l'humà**. Verifica a la documentació del fabricant les dimensions dels dispositius abans de fixar-les; no s'inventen.

## Matriu de dispositius a provar
| Classe | Representants | Què comprovar |
|---|---|---|
| Mòbil petit | Finestra d'aprox. 375 px d'amplada (mínim de `pro-rules.md`) | Cap text tallat ni scroll horitzontal; tàctil >=44 pt |
| Mòbil gran | Pixel 10 Pro, iPhone 17 Pro, Galaxy S recents | Safe areas, notch/dynamic island, barra de gestos; zona del polze |
| Tauleta | Portrait i landscape | Gutters adaptatius, amplada màxima de contingut, llistes en columnes si té sentit |
| Escriptori/portàtil | Aprox. 1280-1536 px (admin) i qualsevol PC | Navegació lateral/taules, hover i focus visibles, teclat |

Tot ha de funcionar també en landscape i amb mida de text del sistema màxima (Dynamic Type).

## Principis
- Mobile-first: l'estil base és el mòbil; es construeix cap amunt per breakpoints dels tokens.
- Cap amplada fixa en píxels per a contenidors; flex/percentatges i `maxWidth` de lectura.
- Sense scroll horitzontal a cap resolució.
- Gutters que creixen amb l'amplada i en landscape; llargada de línia llegible (<80 caràcters en text llarg).
- Safe areas a capçaleres, barres de pestanyes i CTA fixos; contingut amb insets perquè no quedi tapat.
- Tàctil >=44x44 pt (iOS) / >=48x48 dp (Android); `hitSlop` si la icona és més petita.
- A escriptori afegeix hover, focus ring visible i navegació per teclat; les interaccions de només arrossegar tenen alternativa amb botons.
- Patró d'adaptació: mòbil = pestanyes inferiors (<=5); escriptori = barra lateral/taules (a confirmar amb l'humà per pantalla).

## Checklist responsive
- [ ] Provat en mòbil petit, mòbil gran, tauleta (portrait i landscape) i escriptori.
- [ ] Cap scroll horitzontal; cap text o control tallat.
- [ ] Safe areas respectades; contingut no amagat darrere de barres fixes ni teclat.
- [ ] Gutters i amplada màxima de contingut adaptats per breakpoint.
- [ ] Tàctil >=44 pt; hover/focus/teclat a escriptori.
- [ ] Mida de text del sistema màxima i reduced motion sense trencar el layout.
- [ ] Tema clar/fosc/tint vermell comprovats per separat.
- [ ] Imatges i vidre/blur amb rendiment acceptable (60 fps) en mòbil modest.
- [ ] Admin usable des de mòbil (no només escriptori).
