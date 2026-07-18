#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
out="backups/logbook-${stamp}.dump"

docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-logbook}" \
  -d "${POSTGRES_DB:-logbook}" \
  -Fc > "$out"

printf '%s\n' "Created $out"
