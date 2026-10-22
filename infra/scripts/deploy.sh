#!/bin/sh
# Desplega la imatge `perseida-api:<tag>` amb Docker Compose (TG-38).
#
# S'executa al servidor, a `/opt/perseida`, on el workflow `cd.yml` ha deixat
# `docker-compose.yml`, aquest script i el `.env`. Ús:
#
#     ./deploy.sh sha-a1b2c3d              desplega aquest tag
#     ./deploy.sh --rollback sha-a1b2c3d   torna a aquest tag (rollback manual)
#
# Si el desplegament no supera el healthcheck, torna sol a l'última versió bona
# (la guarda a `.deployed-tag`) i desfà les migracions d'Alembic fins a la seva
# revisió; surt sempre amb error perquè el job quedi en vermell.
#
# `API_IMAGE_TAG` a l'entorn té prioritat sobre el del `.env`, així el tag només
# viu en aquesta execució. `HEALTH_TIMEOUT` (segons, 120 per defecte) és l'espera
# màxima perquè l'API respongui bé al healthcheck.
set -eu

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}
STATE_FILE=.deployed-tag

# Zero si `/api/health` respon 200 amb `status: ok`. Es consulta des de dins del
# contenidor de l'API: el servidor no exposa aquest port a fora.
api_healthy() {
  docker compose exec -T api python3 -c "
import json, sys, urllib.request
try:
    body = json.load(urllib.request.urlopen('http://localhost:8000/api/health', timeout=5))
except Exception:
    sys.exit(1)
sys.exit(0 if body.get('status') == 'ok' else 1)
" >/dev/null 2>&1
}

wait_healthy() {
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  until api_healthy; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      return 1
    fi
    sleep 3
  done
}

# Referència completa de la imatge de l'API per a un tag, tal com la defineix el Compose.
image_of() {
  API_IMAGE_TAG=$1 docker compose config --images | grep '/perseida-api:'
}

# Revisió d'Alembic (head) que porta la imatge d'un tag; buit si no es pot saber.
head_of() {
  docker run --rm --entrypoint alembic "$(image_of "$1")" heads | grep '(head)' | awk 'NR==1 {print $1}'
}

# Torna de `$1` (el tag que corre ara) a `$2`: atura l'API, desfà les migracions
# amb la imatge de `$1` (és la que té les migracions noves) fins a la revisió de
# `$2`, i arrenca `$2`. Si el downgrade falla, arrenca igualment `$2` i ho avisa.
rollback_to() {
  from=$1
  to=$2
  rev=$(head_of "$to") || rev=""
  if [ -z "$rev" ]; then
    echo "No es pot saber la revisió d'Alembic de $to: no es desfan les migracions." >&2
  fi
  docker compose stop api
  if [ -n "$rev" ] && ! API_IMAGE_TAG=$from docker compose run --rm -T --no-deps api alembic downgrade "$rev"; then
    echo "ATENCIÓ: el downgrade a $rev ha fallat; l'esquema pot no coincidir amb $to." >&2
  fi
  API_IMAGE_TAG=$to docker compose up -d --remove-orphans && wait_healthy
}

mark_deployed() {
  printf '%s\n' "$1" > "$STATE_FILE"
}

cd "$(dirname "$0")"

previous=""
if [ -f "$STATE_FILE" ]; then
  previous=$(cat "$STATE_FILE")
fi

# --- Rollback manual -------------------------------------------------------
if [ "${1:-}" = "--rollback" ]; then
  [ "$#" -eq 2 ] || { echo "Ús: $0 --rollback <tag-de-la-imatge>" >&2; exit 2; }
  target=$2
  [ -n "$previous" ] || { echo "No consta cap versió desplegada ($STATE_FILE): no es pot desfer res." >&2; exit 1; }
  export API_IMAGE_TAG="$previous"
  docker compose pull --policy missing api
  API_IMAGE_TAG=$target docker compose pull --policy missing api
  if rollback_to "$previous" "$target"; then
    mark_deployed "$target"
    echo "Rollback fet: $previous -> $target."
    exit 0
  fi
  echo "El rollback a $target no ha superat el healthcheck en ${HEALTH_TIMEOUT} s." >&2
  exit 1
fi

# --- Desplegament ----------------------------------------------------------
[ "$#" -eq 1 ] || { echo "Ús: $0 <tag> | --rollback <tag>" >&2; exit 2; }
tag=$1

export API_IMAGE_TAG="$tag"
# Els tags per git-sha són immutables: només es baixa la imatge si falta. Si el
# pull falla no s'ha tocat res i el desplegament s'atura aquí.
docker compose pull --policy missing api

if docker compose up -d --remove-orphans && wait_healthy; then
  mark_deployed "$tag"
  echo "Desplegat $tag: l'API respon correctament al healthcheck."
  exit 0
fi

# No es mostren els logs dels contenidors: els del workflow són públics.
echo "L'API no ha respost correctament al healthcheck en ${HEALTH_TIMEOUT} s ($tag)." >&2
if [ -z "$previous" ] || [ "$previous" = "$tag" ]; then
  echo "No hi ha una versió anterior a què tornar: rollback no possible." >&2
  exit 1
fi

echo "Rollback automàtic a $previous..." >&2
if rollback_to "$tag" "$previous"; then
  echo "Rollback fet: l'API torna a respondre amb $previous. El desplegament de $tag ha fallat." >&2
else
  echo "EL ROLLBACK A $previous TAMPOC HA SUPERAT EL HEALTHCHECK: cal intervenir al servidor." >&2
fi
exit 1
