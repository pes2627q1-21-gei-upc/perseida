#!/bin/sh
# Instal·la una versió nova d'`http_top.conf` (zona del límit de peticions, TG-351) a
# `nginx-proxy-manager/http_top.conf`, el fitxer que el Compose munta dins d'NPM.
#
# El CD l'executa des de /opt/perseida amb el fitxer nou com a argument:
#   sh install-http-top.sh http_top.conf.new
#
# En arrencar, NPM fa `chown` a root de tot `/data`, inclòs aquest fitxer muntat, i l'usuari del
# desplegament ja no el pot sobreescriure (hotfix 0.2.2). Si no el pot escriure, l'escriu amb un
# contenidor d'un sol ús de la imatge d'NPM, que hi és root i munta el mateix fitxer. No depèn
# del proxy: funciona encara que estigui aturat o reiniciant-se, i el CD copia abans de
# `deploy.sh`, que és qui l'aixeca. Els dos camins sobreescriuen el contingut sense canviar el
# fitxer de lloc: el muntatge d'un fitxer segueix l'inode, i amb un fitxer nou NPM continuaria
# veient l'antic. La recàrrega de nginx la fa el pas següent del CD.
#
# `NPM_RUN` és l'ordre que obre un `sh` en aquest contenidor (per defecte, el servei del
# Compose); el test `test-npm-startup.sh` hi posa un `docker run` equivalent.

set -eu

new=$1
dst=nginx-proxy-manager/http_top.conf
NPM_RUN=${NPM_RUN:-docker compose run --rm --no-deps -T --entrypoint /bin/sh reverse-proxy}

[ -f "$new" ] || { echo "install-http-top.sh: no existeix $new" >&2; exit 1; }
mkdir -p nginx-proxy-manager

if [ ! -e "$dst" ] || [ -w "$dst" ]; then
  cat "$new" >"$dst"
else
  # shellcheck disable=SC2086  # NPM_RUN és una ordre amb arguments
  $NPM_RUN -c 'cat > /data/nginx/custom/http_top.conf' <"$new"
fi
