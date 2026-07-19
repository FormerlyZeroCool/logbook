# Home Assistant integration v0.1.4

Version 0.1.3 used the presence of `homeassistant.components.llm.LLMTools` to decide whether to register the separate **Logbook** LLM API. On Home Assistant Core 2026.7.2 that symbol exists and the Logbook prompt is injected, but the Logbook tools are not added to the active API instance. The model can therefore emit `LogbookGetLatestEvent` and Home Assistant returns `Tool not found`.

Version 0.1.4 fixes this by always registering the selectable **Logbook** LLM API and making `custom_components/event_logbook/llm.py` a no-op. This keeps the prompt and tool registry together.

After upgrading and restarting Home Assistant, edit the Ollama conversation entity and select both:

- Assist
- Logbook

When both APIs are selected, Home Assistant namespaces the tools, for example `Logbook__LogbookGetLatestEvent`. Start a new conversation after changing the API selection.
