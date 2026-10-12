#!/bin/sh
set -eu

backend_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$backend_dir"

python3 - <<'PY'
import json
import subprocess

config = json.loads(subprocess.run(
    ["docker", "compose", "config", "--format", "json"],
    check=True, capture_output=True, text=True,
).stdout)
if config.get("name") != "backend":
    raise SystemExit("Refusing reset: expected Compose project 'backend'.")
db = config["services"]["db"]
env = db["environment"]
if env.get("POSTGRES_DB") != "visitorhub" or env.get("POSTGRES_USER") != "visitorhub":
    raise SystemExit("Refusing reset: expected development database visitorhub owned by visitorhub.")
mounts = [m for m in db.get("volumes", []) if m.get("target") == "/var/lib/postgresql/data"]
if len(mounts) != 1 or mounts[0].get("source") != "visitorhub-postgres":
    raise SystemExit("Refusing reset: database volume mapping is not the expected project volume.")
volume_name = "backend_visitorhub-postgres"
labels = subprocess.run(
    ["docker", "volume", "inspect", volume_name, "--format", "{{index .Labels \"com.docker.compose.project\"}} {{index .Labels \"com.docker.compose.volume\"}}"],
    check=True, capture_output=True, text=True,
).stdout.strip()
if labels != "backend visitorhub-postgres":
    raise SystemExit("Refusing reset: volume labels do not match this project's PostgreSQL volume.")
print(f"Verified target: Compose project backend; database visitorhub; volume {volume_name}.")
PY

printf 'Type RESET VISITORHUB DEVELOPMENT DATABASE to delete only that database volume: '
IFS= read -r confirmation
if [ "$confirmation" != "RESET VISITORHUB DEVELOPMENT DATABASE" ]; then
  printf 'Reset cancelled.\n'
  exit 1
fi

docker compose down
docker volume rm backend_visitorhub-postgres
docker compose up --build -d
docker compose ps
