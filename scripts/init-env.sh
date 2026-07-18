#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo "Refusing to overwrite existing .env" >&2
  echo "Existing file left unchanged: $(pwd)/.env" >&2
  exit 0
fi

umask 077
cp .env.example .env
printf '%s\n' "Created $(pwd)/.env from .env.example. Edit it before starting the stack."
