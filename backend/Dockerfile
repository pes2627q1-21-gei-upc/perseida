# =============================================================================
# Perseida API – Dockerfile multi-stage
# =============================================================================
# Etapa 1 (builder): instal·la dependències de producció amb uv en un venv
#   aïllat. Etapa 2 (runner): copia el venv i el codi font a una imatge slim
#   neta sense cap eina de build ni dependència de dev.
#
# Requeriments de disseny:
#   · uv com a gestor de dependències (ADR-0013).
#   · Python 3.14.9 (fixat a .python-version; pyproject.toml fixa la família 3.14.*).
#   · Usuari no-root fix (UID 1001) per a seguretat en producció.
#   · PYTHONUNBUFFERED evita el buffering de stdout/stderr, imprescindible
#     per a logs en temps real dins de Docker.
# =============================================================================

# ── Etapa 1: builder ──────────────────────────────────────────────────────────
FROM python:3.14.9-slim AS builder

# Versions fixades per a reproducibilitat
ARG UV_VERSION=0.7.19

# Instal·la uv directament des del wheel oficial de PyPI (cap shell addicional)
RUN pip install --no-cache-dir uv==${UV_VERSION}

# WORKDIR = /app perquè uv sync crea i usa `.venv` AL DIRECTORI ACTUAL.
# Si el WORKDIR fos /build, el venv aniria a /build/.venv i el COPY
# --from=builder /app/.venv copiaria una ruta buida.
WORKDIR /app

# 1. Copia primer ÚNICAMENT els fitxers de metadades del projecte.
#    Gràcies a la separació en capes, Docker pot reutilitzar aquesta capa
#    de la memòria cau quan el codi font canvia però les dependències no.
COPY pyproject.toml uv.lock ./

# 2. Instal·la NOMÉS les dependències de producció (sense el grup [dev]).
#    uv sync crea /app/.venv automàticament si no existeix.
#    --no-install-project: no instal·la el propi paquet "backend";
#    el codi arriba per COPY a l'etapa runner.
#    --frozen: exigeix que uv.lock estigui sincronitzat amb pyproject.toml.
RUN uv sync \
      --frozen \
      --no-dev \
      --no-install-project


# ── Etapa 2: runner ───────────────────────────────────────────────────────────
FROM python:3.14.9-slim AS runner

# ── Variables d'entorn ────────────────────────────────────────────────────────
# PATH: prioritza el venv per sobre del Python del sistema; no cal activar-lo.
# PYTHONUNBUFFERED: logs en temps real (imprescindible amb Docker + uvicorn).
# PYTHONDONTWRITEBYTECODE: evita els .pyc a la imatge (menys superfície).
# VIRTUAL_ENV: convenció que algunes eines (ex. uvicorn) consulten.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV="/app/.venv"

# ── Usuari no-root ────────────────────────────────────────────────────────────
# UID/GID 1001 fix: valor fora del rang de sistema (0-999) i determinista,
# necessari per a polítiques de seguretat de contenidors (Kubernetes,
# securityContext, etc.) i auditories.
# pip s'elimina perquè python:3.14.9-slim el porta per defecte; l'app no
# el necessita en temps d'execució i redueix la superfície d'atac.
RUN groupadd --gid 1001 appgroup \
 && useradd --uid 1001 --gid appgroup --no-create-home --shell /sbin/nologin appuser \
 && pip uninstall -y pip setuptools 2>/dev/null || true

WORKDIR /app

# ── Còpia del venv complet des del builder ─────────────────────────────────────
# Copiem el venv complet: el builder ja ha resolt i instal·lat totes les
# dependències; aquí no hi ha uv ni pip, per tant la superfície d'atac és mínima.
COPY --from=builder /app/.venv /app/.venv

# ── Còpia del codi font i migracions ───────────────────────────────────────────
# Copiem el directori app/ (lògica de negoci), la configuració i migracions
# d'Alembic (alembic.ini, alembic/) i l'script d'entrypoint. El .dockerignore
# s'encarrega d'excloure tests/, *.md, .venv local, etc.
COPY app/ ./app/
COPY alembic.ini ./alembic.ini
COPY alembic/ ./alembic/
COPY entrypoint.sh ./entrypoint.sh

# ── Permisos ───────────────────────────────────────────────────────────────────
RUN chmod +x /app/entrypoint.sh \
 && chown -R appuser:appgroup /app

# Canvia a l'usuari no privilegiat per a totes les instruccions posteriors
# (incloent CMD/ENTRYPOINT).
USER 1001

# ── Port d'escolta ─────────────────────────────────────────────────────────────
# Documenta el port per defecte d'uvicorn; el valor real el gestiona
# docker-compose.yml / el CD amb la variable d'entorn PORT.
EXPOSE 8000

# ── ENTRYPOINT i CMD ───────────────────────────────────────────────────────────
# L'entrypoint executa les migracions d'Alembic i engega uvicorn (#T218).
# Els arguments de CMD es passen a l'entrypoint com a comandament per defecte.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

