#!/bin/sh
set -eu

# Si el primer argument comença per '-' o no es passa cap argument,
# assumim uvicorn amb els paràmetres per defecte.
if [ "$#" -eq 0 ] || [ "${1#-}" != "$1" ]; then
    set -- uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
fi

# Si la comanda a executar és el servidor uvicorn i RUN_MIGRATIONS no és 'false',
# executem primer les migracions d'Alembic a la base de dades.
if [ "$1" = "uvicorn" ] && [ "${RUN_MIGRATIONS:-true}" != "false" ] && [ "${RUN_MIGRATIONS:-true}" != "0" ]; then
    if command -v uv >/dev/null 2>&1; then
        uv run alembic upgrade head
    else
        alembic upgrade head
    fi
fi

# Executa la comanda sol·licitada
if command -v uv >/dev/null 2>&1; then
    exec uv run "$@"
else
    exec "$@"
fi
