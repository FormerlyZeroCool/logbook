# Logbook Events Home Assistant integration

Native Home Assistant LLM tools for the Logbook backend.

## Requirements

- Home Assistant Core 2026.7.2 or newer.
- Logbook backend v0.11.0 or newer.
- The backend must be reachable directly from Home Assistant, normally `http://192.168.68.62:8787`.

## Install with HACS

Add the public GitHub repository as a HACS custom repository in the **Integration** category, download **Logbook Events**, and restart Home Assistant.

Then open **Settings → Devices & services → Add integration → Logbook Events** and enter the backend URL and API key.

The integration validates `/api/v1/capabilities`, downloads `/api/v1/voice-catalog`, and refreshes the catalog every 60 seconds by default.

## Home Assistant 2026.7 conversation setup

Home Assistant 2026.7 can load a prompt fragment from an integration's `llm.py` without reliably dispatching the corresponding tools. Version 0.1.7 therefore always registers a separate LLM API named **Logbook** and leaves the contributed-tool platform as a no-op.

Open the Ollama conversation entity's configuration and select both LLM APIs:

- **Assist**
- **Logbook**

Home Assistant merges selected APIs and namespaces their tools. Logbook tool names will appear as:

- `Logbook__LogbookListEventTypes`
- `Logbook__LogbookLogPointEvent`
- `Logbook__LogbookStartDurationEvent`
- `Logbook__LogbookFinishDurationEvent`
- `Logbook__LogbookGetLatestEvent`
- `Logbook__LogbookUpdateLatestEvent`

The integration prompt tells the model to call the exact offered name. The dedicated Logbook API is always registered so the prompt and callable tools cannot become separated.

## Native LLM tools

- `LogbookListEventTypes`
- `LogbookLogPointEvent`
- `LogbookStartDurationEvent`
- `LogbookFinishDurationEvent`
- `LogbookGetLatestEvent`
- `LogbookUpdateLatestEvent`

Every LLM request receives current exact event type keys, voice aliases, compatible units, tool-selection rules, and response-format guidance. Write calls send Home Assistant's unique tool-call ID as the backend `Idempotency-Key`.

## Migration from YAML tools

Keep `logbook_core_v6.yaml` during initial acceptance testing. Once the native tools work reliably, stop exposing the six YAML scripts to Assist so the model does not see duplicate tools. Existing automations may continue to call the YAML scripts.

## Manual refresh

Call:

```text
event_logbook.refresh_catalog
```

after changing event types or aliases when you do not want to wait for the next poll.

## Domain migration from v0.1.0

Version 0.1.0 used `custom_components/logbook`, which conflicts with Home Assistant Core's built-in `logbook` integration. Remove that old custom directory and config entry. Current versions install as `custom_components/event_logbook`.


## Timestamp behavior in v0.1.5

Every LLM request includes Home Assistant's authoritative current local time, IANA timezone, local ISO value, and UTC ISO value. For write tools:

- An omitted timestamp means now and is filled by the integration.
- A naive ISO value such as `2026-07-18T21:21:00` is interpreted in Home Assistant's configured timezone.
- An offset-aware ISO value preserves its represented instant.
- The integration converts timestamps exactly once and sends canonical UTC with `Z` to the backend.
- Ambiguous or nonexistent local times during daylight-saving transitions are rejected unless an explicit numeric offset is supplied.

Tool results also include local ISO timestamps beside the backend UTC timestamps.

## Measurement display behavior in v0.1.6

The backend stores numeric measurements in the unit type's canonical base unit. Tool results now make the event type's configured default unit the primary LLM measurement:

- `event.measurement.value` is the converted display value.
- `event.measurement.unitKey` and `event.measurement.unit` identify the matching display unit.
- `event.value` mirrors the converted display value for compatibility.
- `event.canonicalValue` and `event.canonicalMeasurement` are storage diagnostics only.

The prompt explicitly tells the model never to pair `canonicalValue` with the event type's display unit.


## Tool argument behavior in v0.1.7

Every tool description and JSON schema now identifies required and optional fields explicitly. The LLM is instructed to omit unknown optional fields rather than fill them with null placeholders. `unit_key` is optional and may only accompany a numeric `value`; omitting it uses the event type's configured default unit. For `LogbookUpdateLatestEvent`, omitted fields remain unchanged, while explicit null is reserved for clearing nullable values such as `value`, `text_value`, or `note`.
