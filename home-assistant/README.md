# Logbook Events Home Assistant integration

Native Home Assistant LLM tools for the Logbook backend.

## Requirements

- Home Assistant Core with the contributed LLM tool platform (`<integration>/llm.py`), introduced in the 2026.7 development cycle.
- Logbook backend v0.11.0 or newer.
- The backend must be reachable directly from Home Assistant, normally `http://192.168.68.62:8787`.

## Install manually

Copy:

```text
custom_components/event_logbook
```

to:

```text
/config/custom_components/event_logbook
```

Restart Home Assistant, then open **Settings → Devices & services → Add integration → Logbook Events**.

Enter the backend URL and API key. The integration validates `/api/v1/capabilities`, downloads `/api/v1/voice-catalog`, and refreshes that catalog every 60 seconds by default.

## Native LLM tools

- `LogbookListEventTypes`
- `LogbookLogPointEvent`
- `LogbookStartDurationEvent`
- `LogbookFinishDurationEvent`
- `LogbookGetLatestEvent`
- `LogbookUpdateLatestEvent`

Every LLM request receives a prompt fragment containing the current exact event type keys, voice aliases, compatible units, tool-selection rules, and response-format guidance. Write calls send Home Assistant's unique tool-call ID as the backend `Idempotency-Key`.

## Migration from YAML tools

Keep `logbook_core_v6.yaml` during initial acceptance testing. Once the native tools work reliably, stop exposing the six YAML scripts to Assist so the model does not see duplicate tools. Existing automations may continue to call the YAML scripts.

## Manual refresh

Call the service:

```text
event_logbook.refresh_catalog
```

after changing event types or aliases when you do not want to wait for the next poll.

## Domain migration from v0.1.0

Version 0.1.0 used `custom_components/logbook`, which conflicts with Home Assistant Core's built-in `logbook` integration. Remove the old custom directory and old custom config entry. Version 0.1.1 installs as `custom_components/event_logbook` and exposes the refresh service as `event_logbook.refresh_catalog`.
