# Migration to Logbook Events v0.1.7

Version 0.1.7 clarifies every native LLM tool's argument contract.

- Each tool description lists its required and optional fields.
- Every schema field carries an explicit required/optional description.
- Unknown optional fields must be omitted rather than sent as placeholder nulls.
- `unit_key` is optional and only valid with a numeric `value`; omitting it uses the event type's configured default unit.
- Update calls clearly distinguish omitted fields (unchanged) from nullable fields (clear the value).

There are no backend, frontend, database, or configuration migrations. Update the HACS integration and restart Home Assistant.
