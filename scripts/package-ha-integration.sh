#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/logbook-home-assistant-integration.zip
zip -qr dist/logbook-home-assistant-integration.zip \
  custom_components hacs.json README.md \
  -x '*/__pycache__/*' '*.pyc'
printf '%s\n' "Created dist/logbook-home-assistant-integration.zip"
