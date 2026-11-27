#!/usr/bin/env bash
# Test del pas del CD que publica el panell d'administració (TG-77, tasca #589).
#
# Prova `install-admin-dist.sh` amb un volum de Docker de prova (no toca el de producció) i
# comprova el cablejat del CD. Comprova:
#   1. El paquet exportat queda al volum, amb les seves subcarpetes.
#   2. Un paquet nou substitueix l'anterior sencer: no en queda cap fitxer vell.
#   3. Un paquet sense `index.html`, o buit, falla amb un missatge clar i NO pisa el que hi ha.
#   4. El CD compila el panell (`expo export --platform web`) en un job abans de tocar el
#      servidor, l'hi envia i usa les mateixes variables públiques que l'APK.
#
# Ús: bash infra/scripts/test-admin-dist.sh   (cal Docker; la CI l'executa al job `proxy`)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT_DIR/infra/scripts/install-admin-dist.sh"
CD_FILE="$ROOT_DIR/.github/workflows/cd.yml"
IMAGE="nginx:1.27-alpine"
VOLUME="perseida-admin-dist-test-$$"
WORK_DIR="$(mktemp -d)"

# Git Bash a Windows: MSYS no ha de reescriure els camins del contenidor.
export MSYS_NO_PATHCONV=1
# L'ordre que obre un `sh` en un contenidor amb el volum de prova en lectura i escriptura
# (a producció, el servei del Compose amb el volum `perseida_admin_dist`).
export ADMIN_RUN="docker run --rm -i -v $VOLUME:/admin --entrypoint /bin/sh $IMAGE"

cleanup() {
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

# Paquet de prova: `make_bundle <carpeta> <marca>` amb index.html i un JS dins _expo/.
make_bundle() {
  local dir="$WORK_DIR/$1"
  mkdir -p "$dir/_expo/static/js/web"
  printf '<html>%s</html>' "$2" >"$dir/index.html"
  printf 'console.log("%s")' "$2" >"$dir/_expo/static/js/web/entry.js"
  tar -czf "$dir.tar.gz" -C "$dir" .
}

in_volume() {
  docker run --rm -v "$VOLUME:/admin:ro" --entrypoint /bin/sh "$IMAGE" -c "$1"
}

[ -f "$INSTALLER" ] || fail "falta infra/scripts/install-admin-dist.sh"

# 4. El CD (sense Docker: es comprova abans de provar res).
grep -q 'admin-bundle:' "$CD_FILE" || fail "el CD no té el job admin-bundle"
grep -q 'expo export --platform web' "$CD_FILE" || fail "el CD no genera el paquet amb expo export --platform web"
grep -q 'install-admin-dist.sh' "$CD_FILE" || fail "el CD no executa install-admin-dist.sh al servidor"
grep -q 'vars.EXPO_PUBLIC_API_BASE_URL' "$CD_FILE" || fail "el CD no passa EXPO_PUBLIC_API_BASE_URL"
grep -q 'vars.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID' "$CD_FILE" || fail "el CD no passa EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"

# 1. Primera instal·lació.
make_bundle v1 "primer"
sh "$INSTALLER" <"$WORK_DIR/v1.tar.gz" || fail "la instal·lació del primer paquet ha fallat"
[ "$(in_volume 'cat /admin/index.html')" = "<html>primer</html>" ] || fail "index.html no és el del primer paquet"
in_volume 'test -f /admin/_expo/static/js/web/entry.js' || fail "falten les subcarpetes del paquet"

# 2. Un paquet nou substitueix l'anterior sencer.
make_bundle v2 "segon"
rm "$WORK_DIR/v2/_expo/static/js/web/entry.js"
printf 'nou' >"$WORK_DIR/v2/nou.txt"
tar -czf "$WORK_DIR/v2.tar.gz" -C "$WORK_DIR/v2" .
sh "$INSTALLER" <"$WORK_DIR/v2.tar.gz" || fail "la instal·lació del segon paquet ha fallat"
[ "$(in_volume 'cat /admin/index.html')" = "<html>segon</html>" ] || fail "index.html no és el del segon paquet"
in_volume 'test -f /admin/nou.txt' || fail "falta un fitxer del paquet nou"
if in_volume 'test -e /admin/_expo/static/js/web/entry.js'; then
  fail "ha quedat un fitxer del paquet anterior"
fi
[ "$(in_volume 'ls -A /admin | grep -c "^\."' || true)" = "0" ] || fail "han quedat carpetes temporals al volum"

# 3. Un paquet sense index.html, o buit, falla i no pisa el que hi ha.
mkdir -p "$WORK_DIR/sense-index"
printf 'x' >"$WORK_DIR/sense-index/altre.txt"
tar -czf "$WORK_DIR/sense-index.tar.gz" -C "$WORK_DIR/sense-index" .
if sh "$INSTALLER" <"$WORK_DIR/sense-index.tar.gz" 2>"$WORK_DIR/err.txt"; then
  fail "un paquet sense index.html s'hauria d'haver rebutjat"
fi
grep -q 'index.html' "$WORK_DIR/err.txt" || fail "el missatge d'error no esmenta index.html"
if sh "$INSTALLER" </dev/null 2>/dev/null; then
  fail "un paquet buit s'hauria d'haver rebutjat"
fi
[ "$(in_volume 'cat /admin/index.html')" = "<html>segon</html>" ] || fail "un paquet rebutjat ha pisat el que hi havia"
in_volume 'test -f /admin/nou.txt' || fail "un paquet rebutjat ha esborrat fitxers"

printf 'OK: el panell es publica sencer, substitueix l'"'"'anterior i un paquet dolent no el pisa\n'
