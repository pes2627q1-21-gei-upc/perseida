#!/bin/sh
# Desplega la imatge `perseida-api:<tag>` amb Docker Compose (TG-38).
#
# S'executa al servidor, a `/opt/perseida`, on el workflow `cd.yml` ha deixat
# `docker-compose.yml`, aquest script i el `.env`. Ús:
#
#     ./deploy.sh sha-a1b2c3d
#
# `API_IMAGE_TAG` a l'entorn té prioritat sobre el del `.env`, així el tag només
# viu en aquesta execució.
set -eu

[ "$#" -eq 1 ] || { echo "Ús: $0 <tag-de-la-imatge>" >&2; exit 2; }
tag=$1

cd "$(dirname "$0")"

export API_IMAGE_TAG="$tag"
docker compose pull api
docker compose up -d --remove-orphans
