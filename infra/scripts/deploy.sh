#!/bin/sh
# Desplega la imatge `perseida-api:<tag>` amb Docker Compose (TG-38).
#
# S'executa al servidor, a `/opt/perseida`, on el workflow `cd.yml` ha deixat
# `docker-compose.yml`, aquest script i el `.env`. Ús:
#
#     ./deploy.sh sha-a1b2c3d
#
# `API_IMAGE_TAG` a l'entorn té prioritat sobre el del `.env`, així el tag només
# viu en aquesta execució. `HEALTH_TIMEOUT` (segons, 120 per defecte) és l'espera
# màxima perquè l'API respongui bé al healthcheck.
set -eu

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}

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

[ "$#" -eq 1 ] || { echo "Ús: $0 <tag-de-la-imatge>" >&2; exit 2; }
tag=$1

cd "$(dirname "$0")"

export API_IMAGE_TAG="$tag"
# Els tags per git-sha són immutables: només es baixa la imatge si falta. Si el
# pull falla no s'ha tocat res i el desplegament s'atura aquí.
docker compose pull --policy missing api

if docker compose up -d --remove-orphans && wait_healthy; then
  echo "Desplegat $tag: l'API respon correctament al healthcheck."
else
  # No es mostren els logs dels contenidors: els del workflow són públics.
  echo "L'API no ha respost correctament al healthcheck en ${HEALTH_TIMEOUT} s ($tag)." >&2
  exit 1
fi
