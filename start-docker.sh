#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_root/Backend"
if [ ! -f .env ]; then
  printf 'Backend/.env is missing. Copy Backend/.env.example to Backend/.env and set POSTGRES_PASSWORD and JWT_SECRET.\n' >&2
  exit 1
fi
docker compose up --build -d
docker compose ps
