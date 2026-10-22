#!/bin/sh
# Desplega la imatge `perseida-api:<tag>` amb Docker Compose (TG-38).
#
# S'executa al servidor, a `/opt/perseida`, on el workflow `cd.yml` ha deixat
# `docker-compose.yml`, aquest script i el `.env`. Ús:
#
#     ./deploy.sh sha-a1b2c3d              desplega aquest tag
#     ./deploy.sh --rollback sha-a1b2c3d   torna a aquest tag (rollback manual)
#
# Si el desplegament no supera el healthcheck, primer comprova de què és culpa:
# arrenca l'última versió bona (la guarda a `.deployed-tag`) SENSE migracions i amb
# el mateix `.env`. Si respon, el fallo era del codi o de les migracions noves: hi
# torna i desfà les migracions d'Alembic fins a la seva revisió. Si tampoc respon,
# el fallo és de configuració o d'infraestructura: no es desfà res (les dades es
# conserven), l'API queda aturada i s'explica. Surt sempre amb error perquè el job
# quedi en vermell.
#
# `API_IMAGE_TAG` a l'entorn té prioritat sobre el del `.env`, així el tag només
# viu en aquesta execució. `HEALTH_TIMEOUT` (segons, 120 per defecte) és l'espera
# màxima perquè l'API respongui bé al healthcheck; `PROBE_TIMEOUT` (60), la de la
# sonda de la versió anterior.
set -eu

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}
PROBE_TIMEOUT=${PROBE_TIMEOUT:-60}
STATE_FILE=.deployed-tag
PROBE_NAME=perseida-probe

# Si es talla la connexió SSH (job cancel·lat, xarxa) el desplegament no s'ha de
# quedar a mig fer, amb l'API aturada o `.deployed-tag` desactualitzat.
trap '' HUP

# Zero si `/api/health` respon 200 amb `status: ok`. Es consulta des de dins del
# contenidor: el servidor no exposa aquest port a fora.
HEALTH_PY="
import json, sys, urllib.request
try:
    body = json.load(urllib.request.urlopen('http://localhost:8000/api/health', timeout=5))
except Exception:
    sys.exit(1)
sys.exit(0 if body.get('status') == 'ok' else 1)
"

api_healthy() {
  docker compose exec -T api python3 -c "$HEALTH_PY" >/dev/null 2>&1
}

probe_healthy() {
  docker exec "$PROBE_NAME" python3 -c "$HEALTH_PY" >/dev/null 2>&1
}

# Espera fins a `$1` segons que la comanda següent (`$2...`) tingui èxit.
wait_for() {
  limit=$1
  shift
  deadline=$(( $(date +%s) + limit ))
  until "$@"; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      return 1
    fi
    sleep 3
  done
}

wait_healthy() {
  wait_for "$HEALTH_TIMEOUT" api_healthy
}

# Referència completa de la imatge de l'API per a un tag, tal com la defineix el Compose.
image_of() {
  API_IMAGE_TAG=$1 docker compose config --images | grep '/perseida-api:'
}

# Revisió d'Alembic (head) que porta la imatge d'un tag; buit si no es pot saber.
head_of() {
  docker run --rm --entrypoint alembic "$(image_of "$1")" heads | grep '(head)' | awk 'NR==1 {print $1}'
}

# Zero si la imatge de `$1` respon al healthcheck arrencada SENSE migracions (només
# uvicorn) amb el mateix `.env`. Un contenidor temporal; no toca la base de dades.
# Diu si el fallo del desplegament és del codi o de les migracions (respon) o de la
# configuració o la infraestructura (no respon).
probe_previous() {
  docker rm -f "$PROBE_NAME" >/dev/null 2>&1 || true
  API_IMAGE_TAG=$1 docker compose run -d --no-deps --name "$PROBE_NAME" api \
    uvicorn app.main:app --host 0.0.0.0 --port 8000 >/dev/null 2>&1 || return 1
  if wait_for "$PROBE_TIMEOUT" probe_healthy; then
    docker rm -f "$PROBE_NAME" >/dev/null 2>&1 || true
    return 0
  fi
  docker rm -f "$PROBE_NAME" >/dev/null 2>&1 || true
  return 1
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

# Un error en escriure l'estat (disc ple) no ha de fer fallar un desplegament sa.
mark_deployed() {
  printf '%s\n' "$1" > "$STATE_FILE" ||
    echo "AVÍS: no s'ha pogut escriure $STATE_FILE; un rollback posterior pot partir d'una versió incorrecta." >&2
}

cd "$(dirname "$0")"

# Un sol desplegament o rollback alhora: el CD ja serialitza els seus runs
# (`concurrency`), però un `--rollback` manual per SSH podria coincidir amb un.
if command -v flock >/dev/null 2>&1; then
  exec 9>.deploy.lock
  flock -n 9 || { echo "Ja hi ha un desplegament o un rollback en curs (.deploy.lock)." >&2; exit 1; }
else
  echo "AVÍS: no hi ha 'flock' al servidor; no es pot evitar un desplegament concurrent." >&2
fi

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
  echo "El rollback a $target no ha superat el healthcheck." >&2
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
echo "L'API no ha superat el healthcheck ($tag)." >&2
if [ -z "$previous" ] || [ "$previous" = "$tag" ]; then
  echo "No hi ha una versió anterior a què tornar: rollback no possible." >&2
  exit 1
fi

docker compose stop api
echo "Comprovant si $previous arrenca amb la mateixa configuració (sense migracions)..." >&2
if ! probe_previous "$previous"; then
  echo "$previous tampoc arrenca amb la mateixa configuració: el fallo és de configuració o d'infraestructura, no del codi de $tag." >&2
  echo "NO es desfan les migracions (les dades es conserven) i l'API queda aturada. Corregeix el secret o la variable de GitHub i torna a executar el CD." >&2
  exit 1
fi

echo "$previous arrenca bé: el fallo és del codi o de les migracions de $tag. Rollback automàtic a $previous..." >&2
if rollback_to "$tag" "$previous"; then
  echo "Rollback fet: l'API torna a respondre amb $previous. El desplegament de $tag ha fallat." >&2
else
  echo "EL ROLLBACK A $previous TAMPOC HA SUPERAT EL HEALTHCHECK: cal intervenir al servidor." >&2
fi
exit 1
