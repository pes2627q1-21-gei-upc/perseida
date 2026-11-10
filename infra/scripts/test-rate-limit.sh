#!/usr/bin/env bash
# Test del límit de peticions per IP als endpoints públics d'esdeveniments (TG-351, tasca #477).
#
# Aixeca un nginx amb les dues confs versionades tal com les fa servir nginx-proxy-manager:
#   - `nginx-proxy-manager/http_top.conf` dins del bloc `http` (NPM l'inclou des de
#     /data/nginx/custom/http_top.conf);
#   - `nginx-proxy-manager/rate-limit.conf` dins del `server` (pestanya «Advanced» del proxy host),
#     amb les variables `$forward_scheme`, `$server` i `$port` que NPM defineix al proxy host.
# L'upstream és un `server` de prova que respon 200, en lloc de l'API.
#
# Comprova:
#   1. Les 21 primeres peticions a /api/events/... passen (1 r/s amb ràfega de 20, sense espera).
#   2. En superar el límit, la resposta és 429 en problem+json (RFC 9457) amb `code`
#      RATE_LIMITED, `Retry-After` i `X-Correlation-ID`.
#   3. La resta de l'API (/api/health) no queda limitada.
#
# Ús: bash infra/scripts/test-rate-limit.sh   (cal Docker; la CI l'executa al job `proxy`)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_DIR="$ROOT_DIR/infra/nginx-proxy-manager"
IMAGE="nginx:1.27-alpine"
NAME="perseida-rate-limit-test"
PORT="${RATE_LIMIT_TEST_PORT:-18080}"
BASE="http://127.0.0.1:$PORT"
BURST=20

WORK_DIR="$(mktemp -d)"

# Git Bash a Windows: Docker Desktop necessita camins de Windows per als volums, i
# MSYS no ha de reescriure els camins del contenidor (/etc/nginx/...) a `docker run`.
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  docker logs "$NAME" 2>&1 | tail -20 >&2 || true
  exit 1
}

for f in http_top.conf rate-limit.conf; do
  [ -f "$CONF_DIR/$f" ] || fail "falta infra/nginx-proxy-manager/$f"
done

cat >"$WORK_DIR/nginx.conf" <<'EOF'
events {}
http {
    include /etc/nginx/perseida/http_top.conf;

    server {
        listen 8080;
        # NPM defineix aquestes variables per a cada proxy host (forward http://api:8000).
        set $forward_scheme http;
        set $server 127.0.0.1;
        set $port 9000;

        include /etc/nginx/perseida/rate-limit.conf;

        location / {
            proxy_pass $forward_scheme://$server:$port;
        }
    }

    # Upstream de prova en lloc de l'API.
    server {
        listen 9000;
        location / {
            default_type application/json;
            return 200 '[]';
        }
    }
}
EOF

docker rm -f "$NAME" >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" \
  -v "$(host_path "$WORK_DIR/nginx.conf"):/etc/nginx/nginx.conf:ro" \
  -v "$(host_path "$CONF_DIR"):/etc/nginx/perseida:ro" \
  -p "127.0.0.1:$PORT:8080" \
  "$IMAGE" >/dev/null

# Espera que nginx respongui (sense tocar /api/events/, per no gastar la ràfega).
ready=0
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" || true)" = "200" ]; then
    ready=1
    break
  fi
  sleep 0.5
done
[ "$ready" = 1 ] || fail "nginx no arrenca amb les confs versionades"

# 1. La ràfega passa sencera: la primera petició i les 20 de la ràfega.
for i in $(seq 1 $((BURST + 1))); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/events/upcoming?days=7")"
  [ "$code" = "200" ] || fail "la petició $i dins del límit ha retornat $code (s'esperava 200)"
done

# 2. Superat el límit: 429 en problem+json. Unes quantes peticions més, per si en
#    el temps de la ràfega s'ha recuperat algun testimoni (1 per segon).
limited=0
for _ in $(seq 1 5); do
  code="$(curl -s -D "$WORK_DIR/headers" -o "$WORK_DIR/body" -w '%{http_code}' "$BASE/api/events/active")"
  if [ "$code" = "429" ]; then
    limited=1
    break
  fi
done
[ "$limited" = 1 ] || fail "cap petició per sobre del límit ha retornat 429"

grep -qi '^content-type: application/problem+json' "$WORK_DIR/headers" \
  || fail "el 429 no és application/problem+json"
grep -qi '^retry-after: 1' "$WORK_DIR/headers" || fail "el 429 no porta Retry-After: 1"
grep -qi '^x-correlation-id: [0-9a-f]\{32\}' "$WORK_DIR/headers" \
  || fail "el 429 no porta X-Correlation-ID"
grep -qi '^strict-transport-security: ' "$WORK_DIR/headers" || fail "el 429 no porta HSTS"

python3 - "$WORK_DIR/body" <<'EOF' || fail "el cos del 429 no és el problem+json esperat"
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
assert body["status"] == 429, body
assert body["code"] == "RATE_LIMITED", body
assert body["title"] == "Too Many Requests", body
assert body["type"] == "about:blank", body
assert body["detail"], body
assert len(body["correlation_id"]) == 32, body
EOF

# 3. La resta de l'API no comparteix el límit.
code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"
[ "$code" = "200" ] || fail "/api/health ha quedat limitat ($code)"

printf 'OK: límit de peticions per IP a /api/events/ (ràfega %s, després 429 problem+json)\n' "$BURST"
