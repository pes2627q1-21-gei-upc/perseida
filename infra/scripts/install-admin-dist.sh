#!/bin/sh
# Publica el panell d'administració (TG-77, tasca #589) al volum `perseida_admin_dist`, que
# nginx-proxy-manager serveix a `/admin/` en lectura (ADR-0009).
#
# El CD l'executa des de /opt/perseida i li passa per stdin el paquet que genera `expo export
# --platform web`, en `.tar.gz`:
#   sh install-admin-dist.sh < admin-dist.tar.gz
#
# El paquet s'extreu primer a una carpeta temporal del mateix volum. Si no és un `.tar.gz`
# vàlid o no té `index.html`, es rebutja i NO es toca el que ja hi havia. Només si és bo, es
# retira el contingut vell i es posa el nou, a l'instant: l'API no s'atura i nginx no veu un
# paquet a mitges. Si fallés el canvi, es torna el contingut vell.
#
# `ADMIN_RUN` és l'ordre que obre un `sh` en un contenidor amb el volum muntat en lectura i
# escriptura a `/admin` (per defecte, una imatge d'NPM d'un sol ús; vegeu sota). El test
# `test-admin-dist.sh` hi posa un `docker run` equivalent amb un volum de prova.

set -eu

# Per defecte, un contenidor d'un sol ús amb la mateixa imatge que el proxy (la del Compose) i el
# volum muntat en escriptura. No es pot fer amb `docker compose run -v`: el Compose conserva el
# muntatge de només lectura del servei i `/admin` no es deixa escriure.
if [ -z "${ADMIN_RUN:-}" ]; then
  image=$(docker compose config --images | grep nginx-proxy-manager | head -n 1)
  [ -n "$image" ] || { echo "install-admin-dist.sh: no trobo la imatge del proxy al Compose" >&2; exit 1; }
  ADMIN_RUN="docker run --rm -i -v perseida_admin_dist:/admin --entrypoint /bin/sh $image"
fi

# stdin del contenidor = el paquet. Cometes simples: tot el text és per al `sh` del contenidor.
# shellcheck disable=SC2086  # ADMIN_RUN és una ordre amb arguments
$ADMIN_RUN -c '
  set -eu
  cd /admin
  rm -rf .incoming .old
  mkdir .incoming
  if ! tar -xzf - -C .incoming 2>/dev/null; then
    rm -rf .incoming
    echo "install-admin-dist.sh: el paquet no és un .tar.gz vàlid o és buit; no es publica res" >&2
    exit 1
  fi
  if [ ! -f .incoming/index.html ]; then
    rm -rf .incoming
    echo "install-admin-dist.sh: el paquet no té index.html; no es publica res" >&2
    exit 1
  fi
  mkdir .old
  find . -mindepth 1 -maxdepth 1 ! -name .incoming ! -name .old -exec mv {} .old/ \;
  if ! find .incoming -mindepth 1 -maxdepth 1 -exec mv {} . \; ; then
    find .old -mindepth 1 -maxdepth 1 -exec mv {} . \;
    rm -rf .incoming .old
    echo "install-admin-dist.sh: no es pot posar el paquet nou; es torna el que hi havia" >&2
    exit 1
  fi
  rm -rf .incoming .old
'
