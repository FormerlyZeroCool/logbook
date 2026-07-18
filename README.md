# Logbook monorepo

This repository contains the complete Logbook project:

```text
logbook/
├── backend/                       # Fastify/TypeScript API and migrations
├── frontend/                      # React/Vite dashboard and Nginx proxy
├── custom_components/
│   └── logbook/                   # HACS-compatible Home Assistant integration
│       ├── brand/icon.png
│       └── manifest.json
├── home-assistant/
│   ├── tests/                     # Integration tests
│   └── legacy/logbook_core_v6.yaml
├── scripts/
├── hacs.json
├── compose.yaml
└── .env.example
```

Current component versions:

- Backend: 0.11.0
- Frontend: 0.13.3
- Home Assistant integration: 0.1.1

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

The Home Assistant integration runs inside Home Assistant rather than in Docker Compose.

## Home Assistant integration

The integration source of truth is:

```text
custom_components/logbook
```

For a manual installation, copy that directory to:

```text
/config/custom_components/logbook
```

Restart Home Assistant, then add **Logbook** under **Settings → Devices & services**.

### HACS repository preparation

The repository is laid out for HACS with exactly one integration under `custom_components/`, a root `hacs.json`, and a local brand icon.

Before publishing, replace every occurrence of:

```text
FormerlyZeroCool
```

in `custom_components/logbook/manifest.json` with the GitHub account that will own the repository. Then publish the repository and add it to HACS as a custom **Integration** repository.

Package the integration manually with:

```bash
./scripts/package-ha-integration.sh
```

The archive is created at:

```text
dist/logbook-home-assistant-integration.zip
```

## Safe update workflow on the Web Server

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

