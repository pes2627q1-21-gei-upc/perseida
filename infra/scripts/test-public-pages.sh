#!/usr/bin/env bash
# Test de les pàgines públiques per a Google Auth Platform (TG-343, criteri 2).
#
# Aixeca un nginx amb les confs versionades tal com les fa servir nginx-proxy-manager
# (`security-headers.conf` i `static.conf` dins del `server`, pestanya «Advanced») i amb
# `nginx-proxy-manager/public` muntat a /public, com al Compose. L'upstream és un `server`
# de prova en lloc de l'API.
#
# Comprova:
#   1. `/`, `/privacy` i `/terms` responen 200 sense sessió, en HTML UTF-8, i tenen el text
#      en català, castellà i anglès (`lang="ca"`, `lang="es"` i `lang="en"`).
#   2. Porten una CSP estricta (sense scripts), nosniff, Referrer-Policy i HSTS.
#   3. La pàgina principal enllaça la política de privacitat i les condicions (Google ho
#      demana) i porta l'etiqueta de verificació de Search Console.
#   4. La resta de camins continuen anant a l'API.
#   5. El Compose munta la carpeta de només lectura i el CD la copia al servidor.
#
# Ús: bash infra/scripts/test-public-pages.sh   (cal Docker; la CI l'executa al job `proxy`)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_DIR="$ROOT_DIR/infra/nginx-proxy-manager"
PUBLIC_DIR="$CONF_DIR/public"
IMAGE="nginx:1.27-alpine"
NAME="perseida-public-pages-test"
PORT="${PUBLIC_PAGES_TEST_PORT:-18081}"
BASE="http://127.0.0.1:$PORT"

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

# 5. El Compose i el CD (sense Docker: es comprova abans d'aixecar res).
grep -q -- '- ./nginx-proxy-manager/public:/public:ro' "$ROOT_DIR/infra/docker-compose.yml" \
  || fail "el Compose no munta ./nginx-proxy-manager/public a /public de només lectura"
grep -q 'infra/nginx-proxy-manager/public' "$ROOT_DIR/.github/workflows/cd.yml" \
  || fail "el CD no copia infra/nginx-proxy-manager/public al servidor"

for f in index.html privacy.html terms.html; do
  [ -f "$PUBLIC_DIR/$f" ] || fail "falta infra/nginx-proxy-manager/public/$f"
done

cat >"$WORK_DIR/nginx.conf" <<'EOF'
events {}
http {
    server {
        listen 8080;
        # NPM defineix aquestes variables per a cada proxy host (forward http://api:8000).
        set $forward_scheme http;
        set $server 127.0.0.1;
        set $port 9000;

        include /etc/nginx/perseida/security-headers.conf;
        include /etc/nginx/perseida/static.conf;

        location / {
            proxy_pass $forward_scheme://$server:$port;
        }
    }

    # Upstream de prova en lloc de l'API.
    server {
        listen 9000;
        location / {
            default_type application/json;
            return 200 '{"from":"api"}';
        }
    }
}
EOF

docker rm -f "$NAME" >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" \
  -v "$(host_path "$WORK_DIR/nginx.conf"):/etc/nginx/nginx.conf:ro" \
  -v "$(host_path "$CONF_DIR"):/etc/nginx/perseida:ro" \
  -v "$(host_path "$PUBLIC_DIR"):/public:ro" \
  -p "127.0.0.1:$PORT:8080" \
  "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" || true)" = "200" ]; then
    ready=1
    break
  fi
  sleep 0.5
done
[ "$ready" = 1 ] || fail "nginx no arrenca amb les confs versionades"

# 1 i 2. Cada pàgina: 200, HTML, tres idiomes i capçaleres de seguretat.
for path in / /privacy /terms; do
  name="$(printf '%s' "$path" | tr -c 'a-z' '_')"
  code="$(curl -s -D "$WORK_DIR/$name-headers" -o "$WORK_DIR/$name-body" -w '%{http_code}' "$BASE$path")"
  [ "$code" = "200" ] || fail "$path ha retornat $code (s'esperava 200)"
  grep -qi '^content-type: text/html; charset=utf-8' "$WORK_DIR/$name-headers" \
    || fail "$path no és text/html; charset=utf-8"
  for lang in ca es en; do
    grep -q "lang=\"$lang\"" "$WORK_DIR/$name-body" || fail "$path no té el text en $lang"
  done
  grep -qi "^content-security-policy: default-src 'none'" "$WORK_DIR/$name-headers" \
    || fail "$path no porta una CSP amb default-src 'none'"
  if grep -qi '^content-security-policy: .*script-src' "$WORK_DIR/$name-headers"; then
    fail "$path permet scripts a la CSP"
  fi
  grep -qi '<script' "$WORK_DIR/$name-body" && fail "$path porta un <script>"
  grep -qi '^x-content-type-options: nosniff' "$WORK_DIR/$name-headers" || fail "$path no porta nosniff"
  grep -qi '^referrer-policy: no-referrer' "$WORK_DIR/$name-headers" \
    || fail "$path no porta Referrer-Policy: no-referrer"
  grep -qi '^strict-transport-security: ' "$WORK_DIR/$name-headers" || fail "$path no porta HSTS"
done

# 3. La principal enllaça les altres dues i porta la verificació de Search Console.
grep -q 'href="/privacy"' "$WORK_DIR/_-body" || fail "la pàgina principal no enllaça /privacy"
grep -q 'href="/terms"' "$WORK_DIR/_-body" || fail "la pàgina principal no enllaça /terms"
grep -q '<meta name="google-site-verification" content="[A-Za-z0-9_-]\{20,\}"' "$WORK_DIR/_-body" \
  || fail "la pàgina principal no porta l'etiqueta de verificació de Search Console"

# 4. La resta continua anant a l'API.
for path in /api/health /privacy/x /index.html; do
  body="$(curl -s "$BASE$path")"
  [ "$body" = '{"from":"api"}' ] || fail "$path no arriba a l'API: $body"
done

echo "OK: pàgines públiques (/, /privacy i /terms)"
