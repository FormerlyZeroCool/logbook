# Home Assistant integration domain migration

Version 0.1.0 used `logbook`, which is reserved by Home Assistant Core's built-in Activity/Logbook integration. This prevented reliable discovery of the custom integration's `llm.py` tool platform and risked overriding core functionality.

Version 0.1.1 uses the unique domain `event_logbook`.

Migration:

1. Temporarily re-enable the legacy YAML scripts for Assist if voice access is needed during the change.
2. Remove the old custom integration entry named Logbook from Settings > Devices & services.
3. Remove `/config/custom_components/logbook` or uninstall the old HACS download.
4. Install/update the repository so HACS downloads `/custom_components/event_logbook`.
5. Restart Home Assistant.
6. Add **Logbook Events** with the same backend URL and API key.
7. Confirm `event_logbook.refresh_catalog` exists and test `When did Jay last eat?`.
8. Disable the legacy YAML scripts for Assist again.
