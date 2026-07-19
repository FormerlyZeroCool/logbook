# Migration to Logbook Events v0.1.5

Version 0.1.5 fixes event timestamp handling.

- The LLM prompt now includes Home Assistant's authoritative current local and UTC time.
- Omitted event timestamps are filled by the integration at tool execution time.
- Local ISO timestamps are interpreted using Home Assistant's configured IANA timezone.
- All timestamps sent to the backend are canonical UTC values.
- Existing backend, frontend, database, and Docker services are unchanged.

After updating through HACS and restarting Home Assistant, start a new Assist conversation so the model receives the refreshed clock prompt.
