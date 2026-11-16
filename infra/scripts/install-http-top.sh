#!/bin/sh
# Instal·la una versió nova d'`http_top.conf` (zona del límit de peticions, TG-351) a
# `nginx-proxy-manager/http_top.conf`, el fitxer que el Compose munta dins d'NPM.
#
# El CD l'executa des de /opt/perseida amb el fitxer nou com a argument:
#   sh install-http-top.sh http_top.conf.new
#
# En arrencar, NPM fa `chown` a root de tot `/data`, inclòs aquest fitxer muntat, i l'usuari del
# desplegament ja no el pot sobreescriure (hotfix 0.2.2). Si no el pot escriure, l'escriu des de
# dins del contenidor d'NPM, que hi és root. Els dos camins sobreescriuen el contingut sense canviar
# el fitxer de lloc: el muntatge d'un fitxer segueix l'inode, i amb un fitxer nou NPM continuaria
# veient l'antic. La recàrrega de nginx la fa el pas següent del CD.
#
# `NPM_EXEC` és l'ordre per executar dins d'NPM (per defecte, el servei del Compose); el test
# `test-npm-startup.sh` hi posa `docker exec -i <contenidor>`.

set -eu

new=$1
dst=nginx-proxy-manager/http_top.conf
NPM_EXEC=${NPM_EXEC:-docker compose exec -T reverse-proxy}

[ -f "$new" ] || { echo "install-http-top.sh: no existeix $new" >&2; exit 1; }
mkdir -p nginx-proxy-manager

if [ ! -e "$dst" ] || [ -w "$dst" ]; then
  cat "$new" >"$dst"
else
  # shellcheck disable=SC2086  # NPM_EXEC és una ordre amb arguments
  $NPM_EXEC sh -c 'cat > /data/nginx/custom/http_top.conf' <"$new"
fi
