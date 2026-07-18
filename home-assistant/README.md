# Logbook Home Assistant integration

Native Home Assistant LLM tools for the Home Logbook backend.

The HACS-compatible integration source is located at the repository root:

```text
custom_components/logbook
```

## Requirements

- Home Assistant Core with contributed LLM tool support.
- Logbook backend v0.11.0 or newer.
- The backend must be reachable directly from Home Assistant, normally `http://192.168.68.62:8787`.

## Install manually

Copy:

```text
custom_components/logbook
```

to:

```text
/config/custom_components/logbook
```

Restart Home Assistant, then open **Settings → Devices & services → Add integration → Logbook**.

Enter the backend URL and API key. The integration validates `/api/v1/capabilities`, downloads `/api/v1/voice-catalog`, and refreshes that catalog every 60 seconds by default.

## Install through HACS

Publish the monorepo to GitHub after replacing `FormerlyZeroCool` in the integration manifest. Add that repository to HACS as a custom repository of type **Integration**, download Logbook, and restart Home Assistant.

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
logbook.refresh_catalog
```

after changing event types or aliases when you do not want to wait for the next poll.
