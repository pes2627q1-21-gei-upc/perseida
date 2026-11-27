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
#   1. Les 101 primeres peticions a /api/events/... passen (10 r/s amb ràfega de 100, sense espera).
#   2. En superar el límit, la resposta és 429 en problem+json (RFC 9457) amb `code`
#      RATE_LIMITED, `instance`, `Retry-After` i `X-Correlation-ID`.
#   3. El llistat filtrable /api/events (TG-51, sense barra final) també queda limitat.
#   4. La resta de l'API (/api/health) no queda limitada.
#
# Ús: bash infra/scripts/test-rate-limit.sh   (cal Docker; la CI l'executa al job `proxy`)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_DIR="$ROOT_DIR/infra/nginx-proxy-manager"
IMAGE="nginx:1.27-alpine"
NAME="perseida-rate-limit-test"
PORT="${RATE_LIMIT_TEST_PORT:-18080}"
BASE="http://127.0.0.1:$PORT"
BURST=100

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

for f in http_top.conf rate-limit.conf security-headers.conf static.conf websocket.conf; do
  [ -f "$CONF_DIR/$f" ] || fail "falta infra/nginx-proxy-manager/$f"
done

cat >"$WORK_DIR/nginx.conf" <<'EOF'
events {}
http {
    # Com el nginx.conf d'NPM: confia en `X-Real-IP` quan la petició arriba d'una xarxa
    # privada. A producció tot arriba del NAT de la UPC (`10.x`), i aquí de Docker (`172.x`).
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    real_ip_header X-Real-IP;
    real_ip_recursive on;

    include /etc/nginx/perseida/http_top.conf;

    server {
        listen 8080;
        # NPM defineix aquestes variables per a cada proxy host (forward http://api:8000).
        set $forward_scheme http;
        set $server 127.0.0.1;
        set $port 9000;

        # Tot el que s'enganxa a «Advanced», en l'ordre del README.
        include /etc/nginx/perseida/security-headers.conf;
        include /etc/nginx/perseida/static.conf;
        include /etc/nginx/perseida/websocket.conf;
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

# 1. La ràfega passa sencera: la primera petició i les 100 de la ràfega. La primera
#    també comprova que el camí bo conserva l'HSTS del `server`.
curl -s -D "$WORK_DIR/ok-headers" -o /dev/null "$BASE/api/events/upcoming?days=7"
grep -qi '^strict-transport-security: ' "$WORK_DIR/ok-headers" || fail "el 200 de /api/events/ no porta HSTS"
for i in $(seq 2 $((BURST + 1))); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/events/upcoming?days=7")"
  [ "$code" = "200" ] || fail "la petició $i dins del límit ha retornat $code (s'esperava 200)"
done

# Envia FLOOD peticions en paral·lel a un camí (`curl -Z`; el `?n=` no canvia `$uri`) i deixa
# la primera resposta 429 a `$WORK_DIR/$2-headers` i `$WORK_DIR/$2-body`. En paral·lel perquè,
# a 10 r/s, unes peticions seguides i lentes (Docker Desktop) no passarien mai del límit.
FLOOD=300
flood_until_429() {
  local path="$1" name="$2" first sep='?'
  # Un camí que ja porta paràmetres hi afegeix `n` amb `&`.
  case "$path" in *\?*) sep='&' ;; esac
  rm -f "$WORK_DIR/$name"-r*
  curl -s -Z --parallel-max 50 -i -o "$WORK_DIR/$name-r#1" "$BASE$path${sep}n=[1-$FLOOD]" || true
  first="$(grep -l '^HTTP/1.1 429' "$WORK_DIR/$name"-r* 2>/dev/null | head -n 1 || true)"
  [ -n "$first" ] || return 1
  awk 'NR == 1, /^\r?$/' "$first" > "$WORK_DIR/$name-headers"
  awk 'body { print } /^\r?$/ { body = 1 }' "$first" > "$WORK_DIR/$name-body"
}

# 2. Superat el límit: 429 en problem+json.
flood_until_429 /api/events/active limited || fail "cap petició per sobre del límit ha retornat 429"
mv "$WORK_DIR/limited-headers" "$WORK_DIR/headers"
mv "$WORK_DIR/limited-body" "$WORK_DIR/body"

grep -qi '^content-type: application/problem+json' "$WORK_DIR/headers" \
  || fail "el 429 no és application/problem+json"
grep -qi '^retry-after: 1' "$WORK_DIR/headers" || fail "el 429 no porta Retry-After: 1"
grep -qi '^x-correlation-id: [0-9a-f]\{32\}' "$WORK_DIR/headers" \
  || fail "el 429 no porta X-Correlation-ID"
grep -qi '^strict-transport-security: ' "$WORK_DIR/headers" || fail "el 429 no porta HSTS"
grep -qi '^cache-control: no-store' "$WORK_DIR/headers" || fail "el 429 no porta Cache-Control: no-store"

python3 - "$WORK_DIR/body" <<'EOF' || fail "el cos del 429 no és el problem+json esperat"
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
assert body["status"] == 429, body
assert body["code"] == "RATE_LIMITED", body
assert body["title"] == "Too Many Requests", body
assert body["type"] == "about:blank", body
assert body["detail"], body
assert len(body["correlation_id"]) == 32, body
assert body["instance"] == "/api/events/active", body
EOF

# 2b. `instance` mai copia text del client: un camí desconegut (aquí amb unes cometes,
#     `%22`, que nginx descodifica a `$uri`) dona el prefix fix i el JSON continua vàlid.
flood_until_429 /api/events/%22x odd || fail "el camí desconegut no ha retornat mai 429"
python3 - "$WORK_DIR/odd-body" <<'EOF' || fail "el 429 d'un camí desconegut no porta instance /api/events/"
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
assert body["instance"] == "/api/events/", body
EOF

# 2c. Una `X-Real-IP` falsa no se salta el límit: FLOOD peticions en paral·lel, cadascuna
#     amb una IP inventada diferent (`next` del fitxer de `curl -K`), han d'acabar en 429.
#     `next` reinicia les opcions, així que `output` i `write-out` van a cada bloc.
spoof_config="$WORK_DIR/spoof.curl"
: >"$spoof_config"
for i in $(seq 1 "$FLOOD"); do
  {
    printf 'url = "%s/api/events/active?n=%s"\n' "$BASE" "$i"
    printf 'header = "X-Real-IP: 203.0.%s.%s"\n' "$((i / 250))" "$((i % 250 + 1))"
    printf 'output = "/dev/null"\n'
    printf '%s\n' 'write-out = "%{http_code}\n"' 'next'
  } >>"$spoof_config"
done
spoof_codes="$(curl -s -Z --parallel-max 50 -K "$spoof_config" || true)"
printf '%s\n' "$spoof_codes" | grep -qx 429 \
  || fail "amb una X-Real-IP falsa a cada petició el límit no s'aplica"

# 3. El llistat filtrable (TG-51) és `/api/events`, sense barra final i amb paràmetres:
#    també comparteix el límit, i el 429 és el mateix problem+json.
flood_until_429 "/api/events?category=lunar&category=launch&from=2026-11-17&to=2026-11-30" list \
  || fail "/api/events (sense barra) no queda limitat: cap petició ha retornat 429"
grep -qi '^content-type: application/problem+json' "$WORK_DIR/list-headers" \
  || fail "el 429 de /api/events no és application/problem+json"
grep -qi '^retry-after: 1' "$WORK_DIR/list-headers" \
  || fail "el 429 de /api/events no porta Retry-After: 1"
python3 - "$WORK_DIR/list-body" <<'EOF' || fail "el cos del 429 de /api/events no és el problem+json esperat"
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
assert body["status"] == 429, body
assert body["code"] == "RATE_LIMITED", body
assert len(body["correlation_id"]) == 32, body
assert body["instance"] == "/api/events", body
EOF

# 4. La resta de l'API no comparteix el límit.
code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"
[ "$code" = "200" ] || fail "/api/health ha quedat limitat ($code)"

printf 'OK: límit de peticions per IP a /api/events i /api/events/ (ràfega %s, després 429 problem+json)\n' "$BURST"
