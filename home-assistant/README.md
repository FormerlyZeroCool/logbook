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

Home Assistant 2026.7 does not yet merge tools from an integration's `llm.py` into the built-in Assist API. Version 0.1.3 therefore registers a separate LLM API named **Logbook**.

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

The integration prompt tells the model to call the exact offered name. When Home Assistant gains the contributed-tool platform, the compatibility API is not registered and the tools are contributed directly to Assist without duplication.

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
