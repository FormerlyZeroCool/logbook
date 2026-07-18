#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Run ./scripts/init-env.sh, then edit .env." >&2
  exit 1
fi

# Never creates, copies, replaces, or edits .env.
docker compose --progress=plain build --no-cache api frontend
docker compose up -d
docker compose ps
