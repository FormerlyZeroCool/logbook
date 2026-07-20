# Home Assistant integration

**Logbook Events** exposes the Logbook backend as a native Home Assistant integration and selectable LLM API.

## Requirements

- Home Assistant Core 2026.7.0 or newer
- Logbook backend 0.11.0 or newer
- Direct network access from Home Assistant to the backend
- Backend URL and API key

## Install with HACS

1. Add `https://github.com/formerlyzerocool/logbook` as a HACS custom repository in the **Integration** category.
2. Download **Logbook Events**.
3. Restart Home Assistant.
4. Open **Settings → Devices & services → Add integration → Logbook Events**.
5. Enter the backend URL and API key.

The integration validates `/api/v1/capabilities`, downloads `/api/v1/voice-catalog`, and refreshes the catalog every 60 seconds by default.

## Manual installation

Copy:

```text
custom_components/event_logbook
```

to:

```text
/config/custom_components/event_logbook
```

Restart Home Assistant and add **Logbook Events** from Devices & services.

## Configure the conversation agent

Open the Ollama conversation entity and select both Home Assistant APIs:

```text
Assist
Logbook
```

Home Assistant merges the selected APIs and namespaces tool names to prevent collisions. Logbook tools normally appear as:

```text
Logbook__LogbookListEventTypes
Logbook__LogbookLogPointEvent
Logbook__LogbookStartDurationEvent
Logbook__LogbookFinishDurationEvent
Logbook__LogbookGetLatestEvent
Logbook__LogbookUpdateLatestEvent
```

Start a new conversation after changing the selected APIs so the agent receives the current tool set and prompt.

## Tool contracts

Unknown optional fields should be omitted rather than sent as placeholder values.

| Tool | Required fields | Optional fields | Notes |
|---|---|---|---|
| `LogbookListEventTypes` | none | none | Lists active keys, aliases, default units, and compatible units. |
| `LogbookLogPointEvent` | `event_type_key` | `occurred_at`, `value`, `unit_key`, `text_value`, `note` | Omit `occurred_at` for now. |
| `LogbookStartDurationEvent` | `event_type_key` | `started_at`, `value`, `unit_key`, `text_value`, `note` | Omit `started_at` for now. |
| `LogbookFinishDurationEvent` | `event_type_key` | `ended_at`, `value`, `unit_key` | Omit `ended_at` for now; omit `value` to preserve it. |
| `LogbookGetLatestEvent` | `event_type_key` | none | Returns local timestamps and display-unit measurements. |
| `LogbookUpdateLatestEvent` | `event_type_key` plus at least one correction | `started_at`, `value`, `unit_key`, `text_value`, `note`, `metadata` | Omitted fields remain unchanged. Nullable fields may be cleared explicitly. |

`unit_key` is optional and valid only with a numeric `value`. Omitting it uses the selected event type's configured default unit.

## Time handling

Every LLM request receives an authoritative Home Assistant clock containing:

- configured IANA timezone
- local human-readable time
- local ISO timestamp with offset
- UTC ISO timestamp

For write tools:

- an omitted timestamp means now and is filled by the integration
- a naive ISO timestamp is interpreted in Home Assistant's configured timezone
- an offset-aware timestamp preserves its represented instant
- the integration converts the result exactly once and sends UTC with `Z` to the backend
- ambiguous or nonexistent local times during daylight-saving transitions are rejected unless the model supplies an explicit numeric offset

Tool results include local timestamps beside backend UTC timestamps so the model does not need to perform its own conversion.

## Measurement handling

The backend stores numeric values in each dimension's canonical base unit. Before a tool result reaches the model, the integration converts the event measurement to the event type's configured default display unit.

Normal responses should use:

```text
event.measurement.value
event.measurement.unit
```

Canonical storage diagnostics remain available under:

```text
event.canonicalValue
event.canonicalMeasurement
```

The prompt instructs the model not to pair a canonical value with a display-unit label.

## Catalog refresh

The catalog refreshes automatically. To apply event-type or alias changes immediately, call:

```text
event_logbook.refresh_catalog
```

## Diagnostics and logs

Enable temporary debug logging with the `logger.set_level` action:

```yaml
action: logger.set_level
data:
  custom_components.event_logbook: debug
  homeassistant.components.ollama: debug
  homeassistant.components.conversation: debug
  homeassistant.components.llm: debug
```

Useful log messages include the tools provided to the LLM, structured tool calls, tool responses, and backend errors. Debug levels set at runtime reset after a Home Assistant restart.

## Legacy cleanup

The integration domain is `event_logbook`. An old `/config/custom_components/logbook` directory conflicts with Home Assistant's built-in `logbook` integration and should not remain installed.

`legacy/logbook_core_v6.yaml` is retained for existing automations. Once native tools are accepted, stop exposing the legacy YAML scripts to the same Assist agent to avoid duplicate actions.

## Development

Package the integration from the repository root:

```bash
./scripts/package-ha-integration.sh
```

Run its tests:

```bash
python -m pytest home-assistant/tests
```
