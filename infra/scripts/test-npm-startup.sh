#!/usr/bin/env bash
# Test de regressió del hotfix 0.2.1: nginx-proxy-manager ha d'arrencar amb el muntatge
# d'`http_top.conf` que defineix `infra/docker-compose.yml` (TG-351).
#
# Al primer desplegament de la 0.2.0, NPM no va arrencar: en iniciar-se fa `chown` de tot
# `/data`, i el muntatge de només lectura d'`http_top.conf` feia fallar el servei `prepare`
# d's6, de manera que nginx no s'aixecava. `test-rate-limit.sh` fa servir un nginx normal i no
# ho podia detectar.
#
# Comprova, amb la imatge real d'NPM i el muntatge tal com surt de `docker compose config`:
#   1. NPM arrenca, `nginx -t` és correcte i la zona `events_per_ip` d'`http_top.conf` és
#      carregada al bloc `http`.
#   2. Control: amb el mateix fitxer muntat de només lectura, NPM no arrenca. Així el test
#      demostra que reprodueix el defecte i no passa per casualitat.
#
# Ús: bash infra/scripts/test-npm-startup.sh   (cal Docker; la CI l'executa al job `proxy`)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$ROOT_DIR/infra/docker-compose.yml"
TARGET="/data/nginx/custom/http_top.conf"
NAME="perseida-npm-startup-test"
STARTUP_TIMEOUT="${NPM_STARTUP_TIMEOUT:-180}"

# Git Bash a Windows: Docker Desktop necessita camins de Windows per als volums, i
# MSYS no ha de reescriure els camins del contenidor a `docker run`.
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}
cleanup() {
  docker rm -fv "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  docker logs "$NAME" 2>&1 | tail -30 >&2 || true
  exit 1
}

# Imatge i muntatge d'`http_top.conf` del servei `reverse-proxy`, tal com els resol el Compose.
# `POSTGRES_PASSWORD` és obligatòria al Compose; aquí només cal perquè `config` no falli.
read -r IMAGE SOURCE MODE < <(
  POSTGRES_PASSWORD=test docker compose -f "$COMPOSE" config --format json | python3 -c '
import json, sys
service = json.load(sys.stdin)["services"]["reverse-proxy"]
for volume in service.get("volumes", []):
    if volume.get("target") == sys.argv[1]:
        print(service["image"], volume["source"], "ro" if volume.get("read_only") else "rw")
        break
else:
    sys.exit("el Compose no munta " + sys.argv[1] + " al reverse-proxy")
' "$TARGET"
)
[ -f "$SOURCE" ] || fail "no existeix $SOURCE"

# NPM fa `chown` del fitxer muntat: es munta una còpia perquè el del repo no canviï de propietari.
WORK_DIR="$(mktemp -d)"
trap 'cleanup; rm -rf "$WORK_DIR"' EXIT
cp "$SOURCE" "$WORK_DIR/http_top.conf"

# Arrenca NPM amb `http_top.conf` muntat en el mode `$1` (rw o ro) i espera que acabi
# d'arrencar (0) o que el seu arrencador s6 informi d'un error (1).
start_npm() {
  local mount
  mount="$(host_path "$WORK_DIR/http_top.conf"):$TARGET"
  [ "$1" = "ro" ] && mount="$mount:ro"
  docker rm -fv "$NAME" >/dev/null 2>&1 || true
  # NPM exigeix que `/data` i `/etc/letsencrypt` siguin volums, com al Compose (`npm_data`
  # i `npm_letsencrypt`); aquí són anònims i `docker rm -v` els esborra.
  MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" -v /data -v /etc/letsencrypt -v "$mount" "$IMAGE" >/dev/null
  local waited=0
  while [ "$waited" -lt "$STARTUP_TIMEOUT" ]; do
    # NPM genera `resolvers.conf` en acabar d'arrencar; abans, `nginx -t` falla.
    if MSYS_NO_PATHCONV=1 docker exec "$NAME" test -f /etc/nginx/conf.d/include/resolvers.conf 2>/dev/null \
      && docker exec "$NAME" nginx -t >/dev/null 2>&1; then
      return 0
    fi
    if docker logs "$NAME" 2>&1 | grep -q "s6-rc failed to properly bring all the services up"; then
      return 1
    fi
    sleep 3
    waited=$((waited + 3))
  done
  fail "NPM no ha acabat d'arrencar ni ha fallat en ${STARTUP_TIMEOUT} s"
}

# 1. Amb el muntatge del Compose, NPM arrenca i carrega la zona del límit.
start_npm "$MODE" || fail "NPM no arrenca amb el muntatge del Compose ($MODE)"
docker exec "$NAME" nginx -T 2>/dev/null | grep -q "zone=events_per_ip" \
  || fail "nginx no carrega la zona events_per_ip d'http_top.conf"

# 2. Control: de només lectura, NPM no arrenca (el defecte del primer desplegament de la 0.2.0).
if start_npm ro; then
  fail "NPM arrenca amb http_top.conf de només lectura: el test ja no reprodueix el defecte"
fi

printf 'OK: NPM arrenca amb el muntatge del Compose (%s) i carrega events_per_ip; de només lectura, no\n' "$MODE"
