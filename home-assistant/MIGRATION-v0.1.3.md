# Home Assistant integration v0.1.3

Home Assistant Core 2026.7.2 does not yet load integration-contributed tools from `custom_components/<domain>/llm.py` into the built-in Assist API.

Version 0.1.3 registers a selectable compatibility LLM API named **Logbook** on Home Assistant 2026.7. On newer Home Assistant versions that support contributed tools, it keeps using `llm.py` and does not register the compatibility API.

After upgrading and restarting Home Assistant, edit the Ollama conversation entity and select both:

- Assist
- Logbook

When both APIs are selected, Home Assistant namespaces Logbook tools with `Logbook__`, such as `Logbook__LogbookGetLatestEvent`.
