# Logbook backend

The backend is a Fastify and TypeScript API backed by PostgreSQL 18 with TimescaleDB. It owns event validation, unit conversion, canonical storage, time-series aggregation, and authenticated write reliability.

Use the root [README](../README.md) for deployment. This document covers the backend data model, API behavior, and development workflow.

## Core model

### Event types

Every event references an existing event type. An event type may define:

- a stable key and display name
- a description and voice aliases
- an optional measurement dimension
- a default display/input unit
- active or archived status

Event types do not permanently define point or duration behavior. The write action determines the event shape.

### Events

- A point event has identical start and end timestamps and duration `0`.
- A duration event starts with `ended_at = null` and is finished later.
- Numeric values retain the submitted value/unit and a canonical value in the dimension's base unit.
- Text values, notes, and metadata are optional.
- Start/end and point/duration invariants are enforced by the backend.

### Measurement catalog

`unit_types` defines dimensions such as volume or energy. `units` defines concrete units and their affine conversion to the dimension's base unit:

```text
base value = input value × scaleToBase + offsetToBase
```

The canonical base unit always uses `scaleToBase = 1` and `offsetToBase = 0`.

Seeded dimensions:

| Dimension | Canonical unit | Other seeded units |
|---|---|---|
| Mass | `g` | `mg`, `kg`, `oz`, `lb` |
| Volume | `ml` | `l`, `tsp_us`, `tbsp_us`, `fl_oz_us`, `cup_us` |
| Quantity | `count` | `dozen` |
| Energy | `wh` | `mwh`, `kwh`, `j`, `kj` |
| Power | `w` | `mw`, `kw`, `megawatt`, `hp_mechanical` |

Conversion factors become immutable after a unit has been used by an event. Names, symbols, and aliases remain editable.

## Authentication and idempotency

All `/api/v1/*` endpoints require:

```http
Authorization: Bearer <API_KEY>
```

Authenticated `POST`, `PATCH`, and `DELETE` requests may include:

```http
Idempotency-Key: <unique-request-id>
```

The first completed response is retained for 24 hours. Repeating the same method, URL, and JSON body returns the stored response with `Idempotency-Replayed: true`. Reusing a key for a different request returns `409 idempotency_conflict`.

## API overview

The full contract is defined in [openapi.yaml](openapi.yaml).

### System and voice support

```text
GET /health
GET /api/v1/capabilities
GET /api/v1/voice-catalog
```

`voice-catalog` returns active event types, exact keys, aliases, default units, and compatible units for the Home Assistant integration.

### Unit catalog

```text
GET    /api/v1/unit-types
POST   /api/v1/unit-types
GET    /api/v1/unit-types/:key
PATCH  /api/v1/unit-types/:key
DELETE /api/v1/unit-types/:key
POST   /api/v1/unit-types/:key/units
PATCH  /api/v1/unit-types/:key/units/:unitKey
DELETE /api/v1/unit-types/:key/units/:unitKey
```

### Event types

```text
GET    /api/v1/event-types
POST   /api/v1/event-types
GET    /api/v1/event-types/:key
PATCH  /api/v1/event-types/:key
DELETE /api/v1/event-types/:key
GET    /api/v1/event-types/:key/latest-event
PATCH  /api/v1/event-types/:key/latest-event
GET    /api/v1/event-types/:key/series
```

### Events

```text
POST   /api/v1/events/log
POST   /api/v1/events/start
POST   /api/v1/events/end
GET    /api/v1/events
GET    /api/v1/events/:id
PATCH  /api/v1/events/:id
DELETE /api/v1/events/:id
```

There is intentionally no generic `POST /api/v1/events` endpoint.

## Write examples

Set the key once for local commands:

```bash
export LOGBOOK_URL=http://192.168.68.62:8787
export LOGBOOK_KEY='replace-with-your-api-key'
```

### Log a point event

```bash
curl "$LOGBOOK_URL/api/v1/events/log" \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventTypeKey": "feeding_jay",
    "occurredAt": "2026-07-19T01:20:00.000Z",
    "value": 4,
    "unitKey": "fl_oz_us",
    "note": "Bottle"
  }'
```

### Start and finish a duration event

```bash
curl "$LOGBOOK_URL/api/v1/events/start" \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventTypeKey": "feeding_jay",
    "startedAt": "2026-07-19T01:20:00.000Z"
  }'

curl "$LOGBOOK_URL/api/v1/events/end" \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "eventTypeKey": "feeding_jay",
    "endedAt": "2026-07-19T01:35:00.000Z",
    "value": 4,
    "unitKey": "fl_oz_us"
  }'
```

`events/end` can identify the ongoing event by `eventTypeKey` or `eventId`. Omitting `value` preserves the current measurement. `unitKey` is only valid with a numeric value.

### Read or correct the latest event

```bash
curl "$LOGBOOK_URL/api/v1/event-types/feeding_jay/latest-event" \
  -H "Authorization: Bearer $LOGBOOK_KEY"

curl -X PATCH "$LOGBOOK_URL/api/v1/event-types/feeding_jay/latest-event" \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"note":"Corrected note"}'
```

The latest-event update accepts `startedAt`, `value`, `unitKey`, `textValue`, `note`, and `metadata`. Omitted fields remain unchanged. Point-event start corrections move the end to the same instant; duration-event corrections preserve the existing end and still require end-after-start ordering.

## Event browsing and time series

`GET /api/v1/events` supports pagination, event-type filtering, and case-insensitive note search.

The series endpoint supports:

- raw events or fixed-duration buckets
- calendar-aligned daily and weekly buckets
- an IANA `timeZone` for local calendar boundaries
- `displayUnitKey` for server-side conversion

Example:

```bash
curl "$LOGBOOK_URL/api/v1/event-types/feeding_jay/series?bucket=1%20day&timeZone=America%2FNew_York&displayUnitKey=fl_oz_us" \
  -H "Authorization: Bearer $LOGBOOK_KEY"
```

Durations are returned in seconds. Numeric values and aggregates are converted by the backend before serialization.

## Database schema

Schema files are applied in filename order and recorded in `schema_migrations`:

```text
migrations/001_init.sql
migrations/002_voice_reliability.sql
```

`001_init.sql` creates the core catalog and event schema. `002_voice_reliability.sql` adds voice aliases and idempotency storage. Unit conversion is performed in TypeScript rather than database triggers.

The production Compose stack uses a TimescaleDB hypertable, so Timescale-specific behavior must be validated against the real container rather than only an in-memory PostgreSQL emulator.

## Development

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run check
```

`npm run check` runs linting, strict type checking, tests, and a production build. The test suite covers conversion, validation, CRUD constraints, event mutation, latest-event behavior, series aggregation, voice endpoints, and idempotency.
