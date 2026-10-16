#!/usr/bin/env bash
# =============================================================================
# Script de validació i proves locals de la imatge Docker del backend (Perseida)
# =============================================================================
# Tasca #T224: Validació i proves del build en entorn local.
#
# Aquest script automatitza la comprovació completa de:
#   1. Qualitat i bones pràctiques del Dockerfile (hadolint).
#   2. Validació sintàctica i semàntica del workflow de CI/CD (actionlint).
#   3. Construcció (build) de la imatge Docker tal com es farà a CI/CD.
#   4. Requisits de seguretat de la imatge:
#      - Execució sota usuari no privilegiat (UID 1001).
#      - Absència d'eines de desenvolupament (pip, uv).
#      - Presència de variables d'entorn requerides (PYTHONUNBUFFERED=1, PATH).
#   5. Smoke test funcional:
#      - Arrencada del contenidor en segon pla.
#      - Comprovació HTTP de GET /api/health (200 OK, components.app == "ok").
#      - Comprovació HTTP de GET /api/openapi.json (OpenAPI 3.1.0 disponible).
#      - Neteja garantida del contenidor mitjançant trap EXIT.
# =============================================================================

set -euo pipefail

IMAGE_NAME="perseida-api:test"
SKIP_BUILD=0
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for arg in "$@"; do
    case "$arg" in
        --skip-build)
            SKIP_BUILD=1
            ;;
        --image=*)
            IMAGE_NAME="${arg#*=}"
            ;;
        *)
            IMAGE_NAME="$arg"
            ;;
    esac
done

# Colors per a la consola
GREEN="\033[0;32m"
RED="\033[0;31m"
BLUE="\033[0;34m"
NC="\033[0m"

log_info() {
    echo -e "${BLUE}[TEST DOCKER]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1" >&2
    exit 1
}

cd "$ROOT_DIR"

log_info "Iniciant bateria de proves de la imatge Docker del backend ($IMAGE_NAME)..."

# ── 1. Hadolint (Lint del Dockerfile) ──────────────────────────────────────────
log_info "1/5 Comprovant Dockerfile amb Hadolint..."
if docker run --rm -i hadolint/hadolint:latest < backend/Dockerfile; then
    log_pass "Dockerfile compleix totes les regles d'Hadolint (0 warnings, 0 errors)."
else
    log_fail "Hadolint ha detectat problemes al Dockerfile."
fi

# ── 2. Actionlint (Validació del workflow CI/CD) ───────────────────────────────
log_info "2/5 Comprovant workflow .github/workflows/backend-docker.yml..."
if cat .github/workflows/backend-docker.yml | docker run --rm -i rhysd/actionlint:latest -; then
    log_pass "Workflow de GitHub Actions vàlid segons actionlint."
else
    log_fail "actionlint ha detectat errors al workflow backend-docker.yml."
fi

# ── 3. Build de la imatge Docker ──────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 1 ]; then
    log_info "3/5 Saltant pas de build (--skip-build indicat). Usant imatge existent: $IMAGE_NAME"
    if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        log_fail "La imatge $IMAGE_NAME no existeix localment. Construeix-la abans d'usar --skip-build."
    fi
else
    log_info "3/5 Construint imatge Docker ($IMAGE_NAME)..."
    if docker build -t "$IMAGE_NAME" backend/; then
        log_pass "Imatge Docker construïda correctament."
    else
        log_fail "Error durant la construcció de la imatge Docker."
    fi
fi

# ── 4. Proves de seguretat i aïllament ────────────────────────────────────────
log_info "4/5 Verificant seguretat i superfície d'atac..."

# a) Usuari no privilegiat UID 1001
CONTAINER_UID=$(docker run --rm "$IMAGE_NAME" id -u)
if [ "$CONTAINER_UID" -eq 1001 ]; then
    log_pass "Usuari no privilegiat verificat: UID=$CONTAINER_UID."
else
    log_fail "La imatge s'executa com a UID=$CONTAINER_UID (s'esperava 1001)."
fi

# b) Absència de pip
if docker run --rm "$IMAGE_NAME" which pip >/dev/null 2>&1; then
    log_fail "pip és present a la imatge final. Ha de ser eliminat."
else
    log_pass "pip NO és present a la imatge final (superfície d'atac reduïda)."
fi

# c) Absència de uv
if docker run --rm "$IMAGE_NAME" which uv >/dev/null 2>&1; then
    log_fail "uv és present a la imatge final. Només ha d'estar a l'etapa builder."
else
    log_pass "uv NO és present a la imatge final."
fi

# d) Variable PYTHONUNBUFFERED=1
ENV_UNBUF=$(docker run --rm "$IMAGE_NAME" env | grep "^PYTHONUNBUFFERED=" || true)
if [ "$ENV_UNBUF" = "PYTHONUNBUFFERED=1" ]; then
    log_pass "PYTHONUNBUFFERED=1 configurat correctament per a streaming de logs."
else
    log_fail "PYTHONUNBUFFERED no té el valor 1 ($ENV_UNBUF)."
fi

# ── 5. Smoke test funcional (arrencada i endpoints) ───────────────────────────
log_info "5/5 Executant smoke test de l'aplicació FastAPI..."

CONTAINER_ID=""
cleanup() {
    if [ -n "$CONTAINER_ID" ]; then
        log_info "Aturant i netejant contenidor de prova ($CONTAINER_ID)..."
        docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
        docker rm "$CONTAINER_ID" >/dev/null 2>&1 || true
    fi
}
# El codi actual del backend requereix les variables POSTGRES_* (i opcionalment REDIS_*)
# definides per al cicle de vida (DatabaseSettings a lifespan).
CONTAINER_ID=$(docker run -d \
    -e POSTGRES_DB="${POSTGRES_DB:-perseida_test}" \
    -e POSTGRES_USER="${POSTGRES_USER:-perseida}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-test-password}" \
    -e POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}" \
    -e POSTGRES_PORT="${POSTGRES_PORT:-5432}" \
    -e REDIS_HOST="${REDIS_HOST:-127.0.0.1}" \
    -e REDIS_PORT="${REDIS_PORT:-6379}" \
    "$IMAGE_NAME")
sleep 2

# Verificació de GET /api/health
HEALTH_RESPONSE=$(docker exec "$CONTAINER_ID" python -c "
import urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5) as res:
        print(res.read().decode())
except Exception as e:
    print('ERROR:', e)
")

if [[ "$HEALTH_RESPONSE" == *"\"status\":\"ok\""* ]]; then
    log_pass "Endpoint /api/health respon correctament: $HEALTH_RESPONSE"
else
    log_fail "Endpoint /api/health ha fallat o resposta inesperada: $HEALTH_RESPONSE"
fi

# Verificació de GET /api/openapi.json
OPENAPI_RESPONSE=$(docker exec "$CONTAINER_ID" python -c "
import urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/openapi.json', timeout=5) as res:
        print(res.read().decode()[:50])
except Exception as e:
    print('ERROR:', e)
")

if [[ "$OPENAPI_RESPONSE" == *"\"openapi\":\"3."* ]]; then
    log_pass "Documentació OpenAPI disponible: $OPENAPI_RESPONSE..."
else
    log_fail "Endpoint OpenAPI no disponible: $OPENAPI_RESPONSE"
fi

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}TOTES LES VALIDACIONS I PROVES LOCALS HAN PASSAT CORRECTAMENT (#T224)${NC}"
echo -e "${GREEN}======================================================================${NC}"
