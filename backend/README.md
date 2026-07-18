# Home Assistant Time-Series Logbook — Backend

## v0.11.0 Home Assistant voice reliability

- Adds authenticated `/api/v1/capabilities` and `/api/v1/voice-catalog` endpoints.
- Adds optional event-type `voiceAliases` without changing existing event-type contracts.
- Adds optional `Idempotency-Key` handling to every authenticated POST, PATCH, and DELETE route.
- Replays identical completed requests for 24 hours, rejects key/body collisions, and removes expired records before key reuse.
- Preserves all existing frontend and event APIs.

## v0.10.10 prepared-statement parameter fix

- Calendar-aligned day/week series queries pass the timezone as parameter `$5`.
- Fixed-duration series queries now pass only the four parameters referenced by their SQL.
- Prevents PostgreSQL `bind message supplies 5 parameters, but prepared statement requires 4`.

## v0.10.9 local calendar bucket correction

Daily and weekly series aggregation now buckets the event timestamp in the
requested local wall-clock timezone and then converts the bucket boundary back
to an absolute timestamp. This prevents an America/New_York midnight bucket
from being serialized as `00:00Z` and displayed as 8:00 PM on the prior day.
The current partial day is therefore labeled with the correct local date, while
the previous day's total remains attached to the previous calendar day.

## v0.10.7 latest-finish activity summary

Event-type summaries now include `latestEndedAt`, calculated as the latest
non-null event end timestamp for the type. Point events count as completed at
their occurrence time, ongoing duration events are ignored until finished, and
a previous completed event remains visible while a newer duration is ongoing.
This supports the Activity page's live **time since last finish** indicator
without an additional per-type request.

## v0.10.5 paginated event browsing and note search

`GET /api/v1/events` now supports `page`, `pageSize`, and a case-insensitive
`note` substring filter. Responses include pagination metadata while retaining
the legacy `limit` parameter for existing clients. Note search intentionally
uses a plain case-insensitive substring scan for now; a `pg_trgm` index can be added later without
changing the API or frontend search contract.

## v0.10.4 latest-event start-time editing

`PATCH /api/v1/event-types/:key/latest-event` now accepts an optional
`startedAt` timestamp in addition to value, unit, text value, note, and metadata.
For point events, changing the start also moves the end to the same instant. For
duration events, the existing end is preserved and the normal end-after-start
validation still applies. The bundled Home Assistant Assist tool exposes this as
the `start_time` update operation.

## v0.10.3 Home Assistant template compatibility

The bundled Home Assistant REST command and Assist script now expose the end
endpoint's optional `value` and `unitKey` fields. Missing fields are removed from
the JSON payload so finishing without a value preserves the value already stored
on the ongoing event.

A Node.js/TypeScript service built with Fastify, PostgreSQL 18, and TimescaleDB.
It records managed point-in-time observations and start/end duration events for
Home Assistant and presents queryable time-series data to the dashboard.

## v0.9.3 event mutation reload fix

After an event is inserted, edited, or finished, the API reloads it by UUID only.
This avoids comparing PostgreSQL's microsecond `timestamptz` precision with a
JavaScript `Date`, which only preserves milliseconds. Unitless events therefore
serialize normally after completion instead of passing a null row to the unit
serializer.

## Data guarantees

- Every event references an existing `event_types` row.
- The write endpoint determines whether an event is a point or duration event.
- Point events store identical start and end timestamps and duration `0`.
- Duration events are started and subsequently finished.
- Event types may optionally reference a managed `unit_types` dimension.
- Numeric inputs preserve the original value/unit and also store a normalized
  canonical value in the base unit.
- Conversion and compatibility validation run in the TypeScript backend—not in
  database triggers and not in browser code.

## Measurement catalog

The database includes two related catalogs:

- `unit_types`: measurement dimensions such as mass, volume, energy, and power
- `units`: concrete units and an affine conversion to the dimension's base unit

The backend uses:

```text
base value = input value × scaleToBase + offsetToBase
```

A new unit type must be created with one canonical base unit. The base unit is
always identity-converted (`scaleToBase = 1`, `offsetToBase = 0`). Every
additional unit must provide its conversion back to that base.

Seeded dimensions:

| Unit type | Canonical storage | Other seeded units |
|---|---|---|
| Mass | `g` | `mg`, `kg`, `oz`, `lb` |
| Volume | `ml` | `l`, `tsp_us`, `tbsp_us`, `fl_oz_us`, `cup_us` |
| Quantity | `count` | `dozen` |
| Energy | `wh` | `mwh`, `kwh`, `j`, `kj` |
| Power | `w` | `mw`, `kw`, `megawatt`, `hp_mechanical` |

Examples:

```text
2 lb      → 907.18474 g
1.5 L     → 1500 mL
3 tsp     → 1 tbsp → 14.78676478125 mL
2.4 kWh   → 2400 Wh
1.25 kW   → 1250 W
```

Conversion factors cannot be changed after a unit has been used by an event.
Changing names, symbols, and aliases remains safe. Base-unit conversion is
always immutable.

## Deploy on the K11

```bash
unzip logbook-backend-activity-last-finish-v0.10.7.zip
cd logbook-backend
cp .env.example .env
nvim .env
```

Set at least:

```dotenv
BIND_ADDRESS=192.168.68.62
API_PORT=8787
POSTGRES_DB=logbook
POSTGRES_USER=logbook
POSTGRES_PASSWORD=replace-with-a-random-password
API_KEY=replace-with-a-different-random-key
```

Generate secrets:

```bash
openssl rand -hex 32
```

Start:

```bash
docker compose up -d --build
docker compose logs -f api
```

Verify:

```bash
curl http://192.168.68.62:8787/health
```

## Manage unit types

Create a custom distance dimension with meters as its canonical base:

```bash
curl http://192.168.68.62:8787/api/v1/unit-types \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "distance",
    "name": "Distance",
    "baseUnit": {
      "key": "m",
      "name": "Meter",
      "symbol": "m",
      "aliases": ["meter", "meters", "metre", "metres"]
    }
  }'
```

Add kilometers with an explicit conversion to meters:

```bash
curl http://192.168.68.62:8787/api/v1/unit-types/distance/units \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "km",
    "name": "Kilometer",
    "symbol": "km",
    "scaleToBase": 1000,
    "offsetToBase": 0,
    "aliases": ["kilometer", "kilometers"]
  }'
```

Catalog endpoints:

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

Deletes use PostgreSQL foreign-key restrictions. Referenced unit types and units
must remain in the catalog.

## Manage event types

Create an energy series displayed in kWh while storing Wh:

```bash
curl http://192.168.68.62:8787/api/v1/event-types \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "energy_use",
    "name": "Energy use",
    "unitTypeKey": "energy",
    "defaultUnitKey": "kwh"
  }'
```

Create a unitless event series:

```bash
curl http://192.168.68.62:8787/api/v1/event-types \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "dog_walk",
    "name": "Dog walk"
  }'
```

## Log events

Event types do not carry a point/duration mode. The write endpoint determines the
kind of each event row:

```text
POST /api/v1/events/log    -> point event, start = end, duration = 0
POST /api/v1/events/start  -> ongoing duration event
POST /api/v1/events/end    -> close an ongoing duration event, optionally setting its value

Ending by `eventId` first resolves the event, validates that it is an ongoing duration, verifies `endedAt >= startedAt`, and updates by the full TimescaleDB key `(started_at, id)`. The request may also include `value` and optional `unitKey`; the backend applies the same unit validation and canonical conversion used by log/start/edit. Omitting `value` preserves the event's existing value. Invalid timestamps or units return `400`; point/already-ended/concurrently-ended events return `409`; only absent rows return `404`.
```

There is intentionally no generic `POST /api/v1/events`.

The newest event in a series can be corrected without looking up its UUID:

```text
GET   /api/v1/event-types/:key/latest-event
PATCH /api/v1/event-types/:key/latest-event
```

The `PATCH` endpoint accepts `startedAt`, `value`, `unitKey`, `textValue`,
`note`, and `metadata`. Point-event start corrections move the end to the same
instant; duration-event start corrections preserve the existing end. It never
changes the event kind. Value corrections use the same backend unit validation
and canonical conversion as new events.

Point event:

```bash
curl http://192.168.68.62:8787/api/v1/events/log \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "eventTypeKey": "energy_use",
    "value": 2.4,
    "unitKey": "kwh"
  }'
```

The backend persists:

```text
input_value = 2.4
input unit = kwh
value = 2400
canonical unit = wh
```

Start and finish a duration event:

```bash
curl http://192.168.68.62:8787/api/v1/events/start \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventTypeKey":"dog_walk"}'

curl http://192.168.68.62:8787/api/v1/events/end \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventTypeKey":"dog_walk"}'

# A measured duration can receive its final value in the same request.
curl http://192.168.68.62:8787/api/v1/events/end \
  -H "Authorization: Bearer $LOGBOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "eventTypeKey": "feeding",
    "value": 8,
    "unitKey": "fl_oz_us"
  }'
```

## Time-series display conversion

The series endpoint accepts `displayUnitKey`. Conversion is performed by the
backend before returning values and aggregates:

```bash
curl 'http://192.168.68.62:8787/api/v1/event-types/energy_use/series?bucket=1%20day&displayUnitKey=kwh' \
  -H "Authorization: Bearer $LOGBOOK_KEY"
```

Durations remain seconds. For affine units, sums account for the offset once per
observation rather than incorrectly applying it once to the whole aggregate.

## Home Assistant and Assist

The `home-assistant/` directory contains REST commands and scripts for:

- logging point events
- starting and finishing duration events
- reading the latest event for a type, including start, end/ongoing status, and notes
- correcting the latest event's numeric value, unit, text value, or note
- creating and updating event types
- creating and updating unit types
- adding and updating units

Expose catalog-management scripts only to a trusted Assist pipeline. The model
must use exact immutable keys and must not invent conversion factors.

Expose **Get Latest Logbook Event** to the voice assistant. It calls
`GET /api/v1/event-types/{key}/latest-event` and returns a structured tool result
containing `startedAt`, `endedAt`, `ongoing`, and `note`, plus a ready-to-relay
summary. The script description instructs the conversation agent to use it for
questions such as "when was my last dog walk", "when did the latest feeding
start and end", and "what note was on my latest medication event".

## Database initialization

This project currently targets fresh deployments. The complete PostgreSQL 18 and
TimescaleDB schema is defined in one file:

```text
migrations/001_init.sql
```

There are no upgrade or compatibility migrations and no legacy unit columns. The
startup migration runner records `001_init.sql` in `schema_migrations` and will not
re-run it after a successful initialization.

Unit conversion is performed exclusively in the TypeScript backend. PostgreSQL
stores the submitted input value/unit and the backend-computed canonical value; no
database conversion trigger exists.

## Tests

```bash
npm ci
npm run check
```

The test suite includes:

- pure unit-conversion tests
- event-value service validation tests
- Zod contract tests
- catalog CRUD/constraint tests against `pg-mem`
- fresh-schema assertions that enforce the single `001_init.sql` bootstrap

`pg-mem` is useful for fast PostgreSQL-shaped tests, but it is an experimental
emulator and does not implement TimescaleDB. Run the production Compose stack to
validate the initialization schema and Timescale-specific queries before release.

Both projects set `strict`, `noImplicitAny`, and `noImplicitThis` explicitly.
ESLint additionally rejects explicit `any` and requires an annotation on every
function and arrow-function parameter, including contextually typed callbacks.
`npm run check` runs linting, strict type checking, tests where applicable, and a
warning-free production build.

### Get the latest event for a type

```bash
curl http://192.168.68.62:8787/api/v1/event-types/water/latest-event \
  -H "Authorization: Bearer $LOGBOOK_KEY"
```

The query is supported by the composite index `(event_type_id, started_at DESC, id DESC)`. The `id` tie-breaker makes results deterministic when two events share a timestamp.

See `openapi.yaml` for the complete HTTP contract.

## Individual event editing (v0.10.0)

`PATCH /api/v1/events/:id` can update an event's numeric value/unit, text value,
note, `startedAt`, and `endedAt`. Backend validation preserves the event shape:
point events keep identical start/end timestamps, duration ends cannot precede their
starts, and `endedAt: null` makes a duration event ongoing again. Numeric edits are
re-normalized through the same TypeScript conversion service used for new events.



## Ending with a value (v0.10.1)

`POST /api/v1/events/end` optionally accepts `value` and `unitKey`. The value is
normalized in the TypeScript backend and committed atomically with `endedAt`.
`unitKey` requires a numeric value. Supplying `value: null` clears the numeric
value; omitting `value` keeps the value already stored on the ongoing event.

### Calendar-aligned series buckets

The series endpoint accepts an optional `timeZone` IANA identifier, such as `America/New_York`. Calendar-sized buckets such as `1 day` and `1 week` are aligned to midnight in that time zone. When omitted, the endpoint defaults to `UTC`.

## Voice reliability API (v0.11.0)

### Capabilities

`GET /api/v1/capabilities` returns the API version and feature flags used by the Home Assistant integration during setup.

### Voice catalog

`GET /api/v1/voice-catalog` returns only active event types together with:

- exact event type keys
- names and descriptions
- optional `voiceAliases`
- the default unit
- every compatible unit and unit alias

Event type create and update requests may include:

```json
{
  "voiceAliases": ["feed Jay", "Jay feeding", "give Jay a bottle"]
}
```

This is additive. Existing frontend versions may omit the field and continue to work unchanged.

### Idempotent writes

Every authenticated `POST`, `PATCH`, or `DELETE` endpoint accepts an optional header:

```http
Idempotency-Key: unique-request-id
```

The first completed response is retained for 24 hours. Repeating the same method, URL, and JSON body with the same key returns the stored response and includes `Idempotency-Replayed: true`. Reusing the key for a different request returns `409 idempotency_conflict`.

The Home Assistant integration uses each LLM tool call's unique ID as this key, preventing model/provider retries from creating duplicate events or applying a correction twice.
