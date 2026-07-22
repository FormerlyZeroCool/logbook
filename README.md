# Logbook

Logbook is a self-hosted event tracker for Home Assistant. It records point-in-time observations and start/finish activities, normalizes measurements into canonical storage units, and provides a dashboard plus native LLM tools for voice logging and queries.

## Repository layout

```text
logbook/
├── backend/                       # Fastify API, PostgreSQL schema, OpenAPI contract
├── frontend/                      # React dashboard and Nginx API proxy
├── custom_components/
│   └── event_logbook/             # HACS-compatible Home Assistant integration
├── home-assistant/                # Integration tests and legacy YAML reference
├── scripts/                       # Safe environment, deploy, backup, and packaging helpers
├── compose.yaml                   # PostgreSQL/TimescaleDB, API, and dashboard
├── .env.example
└── versions.json
```

| Component | Version |
|---|---:|
| Monorepo | 0.11.12 |
| Backend | 0.11.0 |
| Frontend | 0.13.7 |
| Home Assistant integration | 0.1.8 |

## Features

- Managed event types with aliases and optional measurement dimensions.
- Point events and ongoing duration events using separate write actions.
- Canonical unit storage with compatible display/input units.
- Paginated event browsing, editing, note search, and event-type filtering.
- Time-series charts with local calendar aggregation and unit conversion.
- Native Home Assistant LLM tools for listing, logging, starting, finishing, reading, and correcting events.
- Idempotent authenticated writes to protect against duplicate retries.

## Run the stack

The root Compose project starts PostgreSQL/TimescaleDB, the API, and the dashboard.

```bash
git clone https://github.com/formerlyzerocool/logbook.git
cd logbook
./scripts/init-env.sh
```

`init-env.sh` creates `.env` only when it does not already exist. It never replaces an existing file. Edit the generated file, then deploy:

```bash
nvim .env
./scripts/deploy-stack.sh
```

Default service ports are:

```text
API:       http://<host>:8787
Dashboard: http://<host>:8790
```

Verify the API:

```bash
curl http://<host>:8787/health
```

### Required environment values

At minimum, set unique values for:

```dotenv
POSTGRES_PASSWORD=replace-with-a-random-password
API_KEY=replace-with-a-different-random-key
```

Generate secrets with:

```bash
openssl rand -hex 32
```

Set `API_BIND_ADDRESS` and `FRONTEND_BIND_ADDRESS` to an address reachable from the clients that need them. Do not expose either service directly to the public internet without authentication, TLS, and appropriate network controls.

## Safe updates and backups

The deployment scripts do not create or modify `.env`.

```bash
cd ~/services/logbook/logbook
git pull --ff-only
./scripts/backup-db.sh
./scripts/deploy-stack.sh
```

Database backups are written to `backups/` and excluded from Git. Never use `docker compose down -v` during a normal update because it removes the database volume.

## Home Assistant integration

Install **Logbook Events** through HACS as an Integration repository, restart Home Assistant, then add it under:

```text
Settings → Devices & services → Add integration → Logbook Events
```

Enter the backend URL and API key. For an Ollama conversation agent, select both Home Assistant APIs:

```text
Assist
Logbook
```

Home Assistant namespaces the merged tools, so names may appear with a `Logbook__` prefix.

The integration supplies the model with the current Home Assistant clock and catalog on every request. It converts write timestamps to UTC before calling the backend and converts canonical measurements into each event type's configured display unit before returning query results.

Detailed installation, tool contracts, and troubleshooting are in [home-assistant/README.md](home-assistant/README.md).

## Documentation

- [Backend data model and API guide](backend/README.md)
- [Complete OpenAPI contract](backend/openapi.yaml)
- [Frontend features and development](frontend/README.md)
- [Home Assistant integration](home-assistant/README.md)

## Development checks

Backend:

```bash
cd backend
npm ci
npm run check
```

Frontend:

```bash
cd frontend
npm ci
npm run check
```

Home Assistant integration tests:

```bash
python -m pytest home-assistant/tests
```

## Legacy YAML

`home-assistant/legacy/logbook_core_v6.yaml` is retained only for existing automations and comparison during native-integration testing. Do not expose both the legacy YAML scripts and the native Logbook tools to the same Assist agent because duplicate actions reduce tool-selection reliability.
