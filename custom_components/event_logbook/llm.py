"""Disable prompt-only contributed tools until Home Assistant dispatches them reliably.

Logbook is exposed through the separately registered ``Logbook`` LLM API in
``llm_api.py``. Users select both Assist and Logbook in their conversation
agent. Keeping this platform as a no-op prevents the model from seeing Logbook
instructions when the corresponding tools are not in the active API instance.
"""

from __future__ import annotations

from homeassistant.components import llm as llm_component
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.llm import LLMContext


@callback
def async_get_tools(
    hass: HomeAssistant,
    llm_context: LLMContext,
    api_id: str,
) -> llm_component.LLMTools | None:
    """Return no contributed tools; use the registered Logbook LLM API."""
    del hass, llm_context, api_id
    return None
