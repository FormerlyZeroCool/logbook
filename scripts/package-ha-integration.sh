#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/logbook-events-home-assistant-integration-v0.1.8.zip
zip -qr dist/logbook-events-home-assistant-integration-v0.1.8.zip \
  custom_components/event_logbook brand hacs.json README.md \
  -x '*/__pycache__/*' '*.pyc'
printf '%s\n' "Created dist/logbook-events-home-assistant-integration-v0.1.8.zip"
