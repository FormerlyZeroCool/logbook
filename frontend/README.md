# Home Assistant Time-Series Logbook — Frontend

## Forward-aligned event gaps (v0.12.7)

The **Time gaps** curve is now aligned with the event that begins the gap rather than the event that ends it. A point at event A therefore represents the elapsed time from event A until event B, making it easier to compare an event's recorded value with how long it was until the next event. Tooltips now use **Until next start** and **Next start** labels.

## Recorded-values curve toggles (v0.12.6)

The dual-axis **Recorded values** chart now has independent **Values** and **Time gaps** toggles. Hiding a curve also hides its y-axis and removes that metric from the tooltip. The chart rescales its time domain to the visible data, unavailable curves are disabled, and the final visible curve cannot be turned off.

## Dual-axis recorded values chart (v0.12.5)

The **Recorded values** chart now overlays **time between event starts** as a second curve. Recorded values remain on the left y-axis, while elapsed time labels are shown on the right y-axis. The standalone interval panel has been removed. Aggregated value buckets can still be selected; the interval curve remains based on individual events.

## Chart panel order (v0.12.4)

The **Time between event starts** chart now occupies the full-width position previously used by **Event durations**. The **Event durations** chart has moved into the responsive two-column row alongside **Value ÷ duration**.

## Refined chart markers (v0.12.3)

Chart markers now use a moderate four-pixel radius with a solid fill and black outline. Hovered markers expand to six pixels. The white halo from v0.12.2 has been removed.

## Continuous-time chart rendering fix (v0.12.1)

The Event durations chart and bucketed Recorded values chart now render as continuous-time area-and-point series. Recharts categorical bars cannot render against a numeric timestamp x-axis, which caused the axes to appear without any event marks after proportional time spacing was introduced. The replacement preserves proportional event spacing, detailed hover information, and zero-duration points.

## Event interval and value-rate charts (v0.12.0)

The event-type detail page now adds two responsive charts on the same row:

- **Time between event starts** plots the elapsed time between consecutive event starts.
- **Value ÷ duration** plots numeric duration events as the selected display unit per minute. Point events, events without numeric values, and zero-length durations are omitted. Ongoing event rates update as their elapsed duration changes.

Both charts use the same continuous time-scale x-axis as the existing charts and retain detailed hover information for value, text, note, and duration.

## Proportional time axes (v0.11.9)

The Recorded values and Event durations charts now use a continuous time-scale x-axis. Events that occur close together render close together, while larger gaps take proportionally more horizontal space. Aggregated value buckets are positioned at their actual bucket timestamps.

## Fixed three-event activity preview (v0.11.8)

The **Recent activity** page now always requests and displays only the three
newest events for each event type. The previous per-type count selector has been
removed; the complete history remains available through **Browse all events**.

## Activity start and finish indicators (v0.11.7)

Each event-type card on **Recent activity** now shows both **Last event start**
and **Last event finish**. Both values refresh every 30 seconds. The finish
value is based on the newest completed event: an ongoing duration does not erase
the previous finish, and a type with no completed events shows **No finished
events yet**. This release requires backend v0.10.7 or newer.

## Recorded-value aggregation (v0.11.5)

The **Recorded values** chart now has an **Aggregation** selector. Keep
**Individual events** for the original point-by-point chart, or choose 15-minute,
hourly, 6-hour, daily, or weekly buckets. Bucketed mode asks the existing series
API for that interval and plots the sum of numeric values in each non-empty
bucket as a continuous-time area-and-point series. The tooltip includes the bucket start and event count.

## Activity last-start indicator (v0.11.4)

Each event-type card on **Recent activity** shows how long it has been since the
latest event started. The value refreshes every 30 seconds in the browser and
uses the event type summary's `latestStartedAt` field, so no additional API call
or backend deployment is required. Types without any events show **No events yet**.

## Event-type filtering (v0.11.1)

The **Events** page can filter the paginated history by event type, including
archived types, and combine that filter with the existing case-insensitive note
search. Clearing filters resets both controls.

## Event browser

The toolbar includes a visible **Event type** selector that filters immediately and can be combined with note search. (v0.11.0)

The new **Events** page is linked from Recent Activity and the main navigation.
It lists the complete event history with numbered pagination, supports
case-insensitive note search, and provides per-row finish, edit, and delete
actions. Editing reuses the full event editor for values, units, start/end
timestamps, text values, and notes.

## Edit-latest start-time support (v0.10.1)

The **Edit latest** dialog now includes the event start time. Point events move
their end to the same instant, while duration events preserve their existing end
and reject a new start that would fall after it. The per-row **Edit** dialog
continues to support changing both start and end timestamps. The dialog updates
the event it displayed by UUID, so a newly logged event cannot redirect the edit
to a different row while the dialog is open.

A responsive React dashboard for the Home Logbook API.

## Frontend stack

- **Tailwind CSS 4** for layout, responsive styling, and theme tokens
- **shadcn-style source components** built on Radix Dialog/Label primitives
- **Recharts** for responsive value and duration visualizations
- **TanStack Query** for cached API reads and coordinated invalidation
- **Lucide React** for a consistent icon set
- **React Router** for dashboard navigation

The value chart is a continuous-time area chart with recorded values on the left axis and time until the next event start on the right axis. Bucketed sums use the same left axis while the interval curve remains event-level. The duration and value-per-duration charts appear side by side. All charts use custom tooltips. Unit conversion and bucket aggregation remain server-side.

## Pages

- **Activity:** recent events grouped by event type, including time since each type's latest start and latest completed finish, with a link to the full history
- **Events:** paginated history with event-type filtering, note search, and per-event edit/delete actions
- **Event types:** create, update, archive, delete unused types, and select their
  measurement units
- **Units:** create and edit unit types, add conversion units, and inspect usage
- **Series detail:** raw values or selectable bucketed sums overlaid with forward-aligned time-to-next-start gaps on a dual-axis chart, plus event durations and value-per-duration rates, with an **Edit latest** action for correcting the newest start time, value, or note

## Unit behavior

The browser does not normalize submitted data and does not convert chart data.
It sends the original value and selected unit key to the API. The backend:

1. validates that the unit belongs to the event type's measurement dimension
2. converts it to the canonical base unit
3. stores original and canonical values
4. converts series data to the requested display unit before returning it

The series page has a display-unit selector for mass, volume, quantity, energy,
power, and custom dimensions.

## Unit management

The **Units** page supports:

- creating a dimension and its canonical base unit
- adding units with required `scaleToBase` and `offsetToBase`
- updating names, symbols, and aliases
- updating conversion factors before a unit is used
- blocking base-unit deletion and unsafe conversion changes

Conversion formula shown in the UI:

```text
base value = input value × scale + offset
```

## Event-type management

The **Event types** page supports creating and editing the controlled catalog.
Event logging always selects an existing type, so a typo cannot create an
accidental time series.

- **Log point** creates a zero-duration event.
- **Start duration** creates an ongoing event that is later finished.
- The endpoint used determines each event row's kind; event types do not carry a mode.
- Measurement dimension locks after the first numeric event.
- Default display/input unit can still be changed safely.

## Deploy on the K11

```bash
unzip logbook-frontend-curve-toggles-v0.12.6.zip
cd logbook-frontend
cp .env.example .env
nvim .env
```

Set:

```dotenv
FRONTEND_BIND=192.168.68.62
FRONTEND_PORT=8790
BACKEND_URL=http://192.168.68.62:8787
API_KEY=the-same-key-used-by-the-backend
```

Build and start:

```bash
docker compose up -d --build
docker compose logs -f
```

Open:

```text
http://192.168.68.62:8790
```

The production Nginx container proxies `/api/*` and injects the bearer token, so
the API key is not included in browser JavaScript. The proxy removes the browser
`Origin` header before forwarding the request because this is a same-origin
frontend request, not direct browser access to the API. Direct API access remains
controlled by the backend `CORS_ORIGINS` allowlist.

## Add to Home Assistant

Create a **Webpage dashboard** pointing to:

```text
http://192.168.68.62:8790
```

If Home Assistant is served over HTTPS, publish this frontend over HTTPS too to
avoid mixed-content blocking.

## Local development

```bash
npm ci
VITE_DEV_API_TARGET=http://192.168.68.62:8787 \
VITE_DEV_API_KEY=your-api-key \
npm run dev
```

Validation:

```bash
npm run check
```

The frontend sets `strict`, `noImplicitAny`, and `noImplicitThis` explicitly.
ESLint rejects explicit `any` and requires an explicit annotation on every
function and arrow-function parameter, including React handlers and collection
callbacks. The production build splits React, TanStack Query, UI primitives, and Recharts into separate chunks and completes without warnings.

## Event actions

Each event type supports both explicit actions:

- **Log point** calls `POST /events/log` and creates a zero-duration observation.
- **Start duration** calls `POST /events/start`; **Finish** calls `POST /events/end`.
- **Edit latest** calls `PATCH /event-types/{key}/latest-event` to correct the newest start time, value, input unit, text value, or note.
- **Events** calls paginated `GET /events` and uses `PATCH`/`DELETE /events/{id}` for full-history corrections.

Event types do not store a behavior mode. The selected action determines the kind
of event row, which avoids sending a redundant mode field from the browser.

## 0.9.1 delete-event fix

The shared API client now sends `Content-Type: application/json` only when a request actually has a body. This prevents Fastify from rejecting bodyless `DELETE /api/v1/events/:id` requests with `Body cannot be empty when content-type is set to 'application/json'`.

## Finish-event timestamp behavior

The frontend sends an explicit browser timestamp when finishing an ongoing event:

```json
{
  "eventId": "...",
  "endedAt": "2026-07-15T21:30:45.123Z"
}
```

This avoids relying on the API host clock for interactive frontend completion. Keep NTP enabled on the API host because server-originated and voice-assistant requests may still depend on synchronized system time.

## Recent-event editing (v0.10.0)

Every row in **Recent events** now has an **Edit** action. The dialog supports value
and input unit, start and end timestamps, text value, and note. Clearing a duration's
end by selecting **This event is still ongoing** reopens it. Point events expose one
occurrence time and automatically keep their end equal to their start.


## Interactive chart ranges (v0.13.0)

Event-type charts now include 24-hour, 2-day, 3-day, 7-day, 2-week,
30-day, and 90-day presets. Start and end `datetime-local` controls always
reflect the active range and can be edited directly for an arbitrary window.
Dragging horizontally between timestamps on the Recorded values chart selects
that interval, updates both date-time controls, and refetches all charts for the
new range.

### Calendar-aligned aggregation

The frontend sends the browser's IANA time zone with series requests. Daily and weekly aggregations therefore begin at local midnight instead of a UTC offset displayed as an arbitrary local time.
