# Logbook monorepo

This repository contains the complete Logbook project:

```text
logbook/
├── backend/                       # Fastify/TypeScript API and migrations
├── frontend/                      # React/Vite dashboard and Nginx proxy
├── custom_components/
│   └── event_logbook/             # HACS-compatible Home Assistant integration
├── brand/                         # HACS brand assets
├── home-assistant/
│   ├── tests/
│   └── legacy/logbook_core_v6.yaml
├── scripts/
├── compose.yaml
└── .env.example
```

Current component versions:

- Backend: 0.11.0
- Frontend: 0.13.3
- Home Assistant integration: 0.1.7

## Important environment-file rule

`.env` is local state and is ignored by Git. Repository scripts never overwrite it.

To create it only when one does not already exist:

```bash
./scripts/init-env.sh
```

If `.env` already exists, the script exits without changing it.

## Run the application stack

The root Compose project runs PostgreSQL/TimescaleDB, the API, and the frontend:

```bash
./scripts/deploy-stack.sh
```

The Home Assistant integration is source code in this repository, but it runs inside Home Assistant rather than in Docker Compose. Copy or sync:

```text
custom_components/event_logbook
```

to:

```text
/config/custom_components/event_logbook
```

Then restart Home Assistant and add **Logbook Events** under **Settings → Devices & services**.

## Safe update workflow on the K11

Do not extract a release over a working checkout and do not replace `.env`.

Recommended Git workflow:

```bash
cd ~/services/logbook/logbook
git pull --ff-only
./scripts/backup-db.sh
./scripts/deploy-stack.sh
```

The existing `.env` remains untouched.

## Initialize the Git repository

```bash
cd ~/services/logbook/logbook
git init
git add .
git commit -m "Initial Logbook monorepo"
```

Add a private remote before pushing because the project controls personal household data, even though `.env` and database dumps are excluded.

## Home Assistant integration development

The source of truth is:

```text
custom_components/event_logbook
```

The domain is intentionally `event_logbook`. Home Assistant already owns the core `logbook` domain for its built-in Activity integration, so a custom component must not use that domain.

For a manual installation, copy that directory into Home Assistant's `/config/custom_components/`. During transition, the legacy YAML package remains under:

```text
home-assistant/legacy/logbook_core_v6.yaml
```

Do not expose both the legacy YAML voice tools and native integration tools to Assist after the integration has been accepted, because duplicate tools reduce tool-selection reliability.

## Migrating from integration v0.1.0

Integration v0.1.0 incorrectly used Home Assistant's reserved core domain `logbook`. Remove `/config/custom_components/logbook` and its custom config entry before installing v0.1.1. Then install `custom_components/event_logbook`, restart Home Assistant, and add **Logbook Events** again. The backend API key and event data do not change.


## Home Assistant 2026.7 LLM APIs

After installing the integration, configure the Ollama conversation entity to use both **Assist** and **Logbook** LLM APIs. Home Assistant 2026.7 merges them and exposes Logbook tools with a `Logbook__` prefix.


## Home Assistant time handling

The Logbook LLM API supplies every model request with Home Assistant's current local time, IANA timezone, local ISO timestamp, and UTC timestamp. Write tools normalize all event timestamps inside the integration and always send canonical UTC values to the backend. Missing timestamps mean "now" and use the Home Assistant integration clock, not the backend clock.

## Home Assistant display-unit handling

The native integration converts backend canonical values into each event type's configured default display unit before returning a tool result to the LLM. For example, a `feeding_jay` value stored canonically in milliliters is presented through `event.measurement` in `fl_oz_us` when that is the event type's default unit. Canonical storage values remain available under explicitly named diagnostic fields and are not used for normal voice responses.
