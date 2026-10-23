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
# conserven), l'API queda aturada i s'explica. Tampoc es desfà res si el `.env` té
# uns noms de variable diferents dels del darrer desplegament bo (`.deployed-env`):
# una variable nova que falta o és errònia fa fallar la versió nova però no la
# sonda, i s'ha de poder corregir sense perdre dades. Surt sempre amb error perquè
# el job quedi en vermell.
#
# `API_IMAGE_TAG` a l'entorn té prioritat sobre el del `.env`, així el tag només
# viu en aquesta execució. `HEALTH_TIMEOUT` (segons, 120 per defecte) és l'espera
# màxima perquè l'API respongui bé al healthcheck; `PROBE_TIMEOUT` (60), la de la
# sonda de la versió anterior.
set -eu

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}
PROBE_TIMEOUT=${PROBE_TIMEOUT:-60}
STATE_FILE=.deployed-tag
ENV_NAMES_FILE=.deployed-env
PROBE_NAME=perseida-probe

# Si es talla la connexió SSH (job cancel·lat, xarxa) el desplegament no s'ha de
# quedar a mig fer, amb l'API aturada o `.deployed-tag` desactualitzat: SIGHUP i
# SIGPIPE s'ignoren.
trap '' HUP PIPE

# Els missatges mai fan fallar el script: si es talla la connexió, un `echo` a un
# pipe trencat tornaria error (i `set -e` aturaria el desplegament a mig fer).
say() { printf '%s\n' "$*" || true; }
warn() { printf '%s\n' "$*" >&2 || true; }

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

# Arrenca la imatge de `$1` SENSE migracions (només uvicorn) amb el mateix `.env`,
# en un contenidor temporal (`perseida-probe`), i diu si respon al healthcheck. No
# executa migracions; el procés sí obre connexions, per això es desactiva el
# planificador (no ha d'executar feines amb codi antic). Retorna:
#   0  respon: el fallo del desplegament és del codi o de les migracions noves
#   1  no respon: el fallo és de configuració o d'infraestructura
#   2  no s'ha pogut crear la sonda (imatge absent i pull fallit, error de Docker)
probe_previous() {
  docker rm -f "$PROBE_NAME" >/dev/null 2>&1 || true
  # La imatge anterior pot no ser al servidor (p. ex. després d'un `docker image prune`).
  API_IMAGE_TAG=$1 docker compose pull --policy missing api >/dev/null 2>&1 || return 2
  API_IMAGE_TAG=$1 docker compose run -d --no-deps --name "$PROBE_NAME" -e SCHEDULER_ENABLED=false api \
    uvicorn app.main:app --host 0.0.0.0 --port 8000 >/dev/null 2>&1 || return 2
  deadline=$(( $(date +%s) + PROBE_TIMEOUT ))
  result=1
  while :; do
    if probe_healthy; then
      result=0
      break
    fi
    # Si el contenidor ja ha sortit (error d'importació o de configuració) no cal esperar.
    [ "$(docker inspect -f '{{.State.Running}}' "$PROBE_NAME" 2>/dev/null)" = true ] || break
    [ "$(date +%s)" -lt "$deadline" ] || break
    sleep 2
  done
  docker rm -f "$PROBE_NAME" >/dev/null 2>&1 || true
  return "$result"
}

# Nota: aquesta funció i `probe_previous` es criden en context `if`/`||`, on `set -e`
# no actua dins del cos; per això cada ordre que pot fallar ho gestiona explícitament.
#
# Torna de `$1` (el tag que corre ara) a `$2`: atura l'API, desfà les migracions
# amb la imatge de `$1` (és la que té les migracions noves) fins a la revisió de
# `$2`, i arrenca `$2`. Si el downgrade falla, arrenca igualment `$2` i ho avisa.
rollback_to() {
  from=$1
  to=$2
  rev=$(head_of "$to") || rev=""
  if [ -z "$rev" ]; then
    warn "No es pot saber la revisió d'Alembic de $to: no es desfan les migracions."
  fi
  docker compose stop api
  if [ -n "$rev" ] && ! API_IMAGE_TAG=$from docker compose run --rm -T --no-deps api alembic downgrade "$rev"; then
    warn "ATENCIÓ: el downgrade a $rev ha fallat; l'esquema pot no coincidir amb $to."
  fi
  API_IMAGE_TAG=$to docker compose up -d --remove-orphans && wait_healthy
}

# Noms (no valors) de les variables del `.env`, ordenats.
env_names() {
  grep -oE '^[A-Z][A-Z0-9_]*=' .env | sort -u
}

# Un error en escriure l'estat (disc ple) no ha de fer fallar un desplegament sa.
mark_deployed() {
  printf '%s\n' "$1" > "$STATE_FILE" ||
    warn "AVÍS: no s'ha pogut escriure $STATE_FILE; un rollback posterior pot partir d'una versió incorrecta."
  env_names > "$ENV_NAMES_FILE" ||
    warn "AVÍS: no s'ha pogut escriure $ENV_NAMES_FILE; el pròxim desplegament fallit no desfarà migracions."
}

# Zero si el `.env` té els mateixos noms de variable que al darrer desplegament
# bo. Si no es poden comparar (fitxer absent, p. ex. abans d'aquesta comprovació)
# es considera que han canviat: és el cas segur, el que no esborra dades.
env_names_unchanged() {
  [ -f "$ENV_NAMES_FILE" ] && [ "$(env_names)" = "$(cat "$ENV_NAMES_FILE")" ]
}

cd "$(dirname "$0")"

# Un sol desplegament o rollback alhora: el CD ja serialitza els seus runs
# (`concurrency`), però un `--rollback` manual per SSH podria coincidir amb un.
if command -v flock >/dev/null 2>&1; then
  exec 9>.deploy.lock
  flock -n 9 || { warn "Ja hi ha un desplegament o un rollback en curs (.deploy.lock)."; exit 1; }
else
  warn "AVÍS: no hi ha 'flock' al servidor; no es pot evitar un desplegament concurrent."
fi

previous=""
if [ -f "$STATE_FILE" ]; then
  previous=$(cat "$STATE_FILE")
fi

# --- Rollback manual -------------------------------------------------------
if [ "${1:-}" = "--rollback" ]; then
  [ "$#" -eq 2 ] || { warn "Ús: $0 --rollback <tag-de-la-imatge>"; exit 2; }
  target=$2
  [ -n "$previous" ] || { warn "No consta cap versió desplegada ($STATE_FILE): no es pot desfer res."; exit 1; }
  export API_IMAGE_TAG="$previous"
  docker compose pull --policy missing api
  API_IMAGE_TAG=$target docker compose pull --policy missing api
  if rollback_to "$previous" "$target"; then
    mark_deployed "$target"
    say "Rollback fet: $previous -> $target."
    exit 0
  fi
  warn "El rollback a $target no ha superat el healthcheck."
  exit 1
fi

# --- Desplegament ----------------------------------------------------------
[ "$#" -eq 1 ] || { warn "Ús: $0 <tag> | --rollback <tag>"; exit 2; }
tag=$1

export API_IMAGE_TAG="$tag"
# Els tags per git-sha són immutables: només es baixa la imatge si falta. Si el
# pull falla no s'ha tocat res i el desplegament s'atura aquí.
docker compose pull --policy missing api

if docker compose up -d --remove-orphans && wait_healthy; then
  mark_deployed "$tag"
  say "Desplegat $tag: l'API respon correctament al healthcheck."
  exit 0
fi

# No es mostren els logs dels contenidors: els del workflow són públics.
warn "L'API no ha superat el healthcheck ($tag)."
if [ -z "$previous" ] || [ "$previous" = "$tag" ]; then
  warn "No hi ha una versió anterior a què tornar: rollback no possible."
  exit 1
fi

docker compose stop api
warn "Comprovant si $previous arrenca amb la mateixa configuració (sense migracions)..."
probe=0
probe_previous "$previous" || probe=$?
if [ "$probe" -eq 1 ]; then
  warn "$previous tampoc arrenca amb la mateixa configuració: el fallo és de configuració o d'infraestructura, no del codi de $tag."
  warn "NO es desfan les migracions (les dades es conserven) i l'API queda aturada. Corregeix el secret o la variable de GitHub i torna a executar el CD."
  warn "Pot ser que l'esquema sigui més nou que $previous: un \`--rollback\` manual posterior pot avisar que no troba la revisió."
  exit 1
elif [ "$probe" -ne 0 ]; then
  warn "No s'ha pogut crear la sonda amb $previous (imatge absent i pull fallit, o error de Docker): no es pot saber la causa."
  warn "NO es desfan les migracions i l'API queda aturada. Comprova-ho al servidor (\`docker images\`, \`docker compose ps\`)."
  exit 1
fi

if ! env_names_unchanged; then
  warn "$previous arrenca bé, però els noms de variable del .env han canviat des del darrer desplegament bo: la causa pot ser una variable nova que falta o és errònia."
  warn "NO es desfan les migracions (les dades es conserven) i l'API queda aturada. Revisa els secrets i les variables de GitHub i torna a executar el CD."
  exit 1
fi

warn "$previous arrenca bé: el fallo és del codi o de les migracions de $tag. Rollback automàtic a $previous..."
if rollback_to "$tag" "$previous"; then
  warn "Rollback fet: l'API torna a respondre amb $previous. El desplegament de $tag ha fallat."
else
  warn "EL ROLLBACK A $previous TAMPOC HA SUPERAT EL HEALTHCHECK: cal intervenir al servidor."
fi
exit 1
