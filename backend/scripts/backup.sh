#!/usr/bin/env sh
set -eu

mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="backups/logbook-${stamp}.dump"

docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-logbook}" \
  -d "${POSTGRES_DB:-logbook}" \
  --format=custom > "$file"

echo "Created $file"
