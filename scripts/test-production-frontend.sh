#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(pwd)}"
cd "$ROOT"

# Required ordering: all workspace checks pass before any browser test begins.
npm run check

docker compose build --no-cache frontend
docker compose up -d --no-deps frontend

BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8790}"
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "$BASE_URL/explore/new" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent --show-error "$BASE_URL/explore/new" >/dev/null

# Run the browser suite in the official pinned Playwright image. This avoids
# requiring a global Python Playwright installation on the host.
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright/python:v1.54.0-noble}"
DOCKER_NETWORK_ARGS=(--network host)
CONTAINER_BASE_URL="$BASE_URL"

case "$(uname -s)" in
  Darwin|MINGW*|MSYS*|CYGWIN*)
    DOCKER_NETWORK_ARGS=(--add-host=host.docker.internal:host-gateway)
    CONTAINER_BASE_URL="${BASE_URL/127.0.0.1/host.docker.internal}"
    CONTAINER_BASE_URL="${CONTAINER_BASE_URL/localhost/host.docker.internal}"
    ;;
esac

docker run --rm --ipc=host \
  "${DOCKER_NETWORK_ARGS[@]}" \
  -v "$ROOT:/work" \
  -w /work \
  "$PLAYWRIGHT_IMAGE" \
  python frontend/e2e/test_production_frontend.py \
    --base-url "$CONTAINER_BASE_URL"
