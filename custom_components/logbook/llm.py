"""Contribute Logbook tools and prompt context to Home Assistant LLM APIs."""

from __future__ import annotations

from homeassistant.components import llm as llm_component
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.llm import LLMContext

from .const import DOMAIN
from .prompt import build_prompt
from .runtime import LogbookRuntime
from .tools import build_tools


@callback
def async_get_tools(
    hass: HomeAssistant,
    llm_context: LLMContext,
    api_id: str,
) -> llm_component.LLMTools | None:
    """Return dynamically constrained tools for every assembled LLM request."""
    del llm_context, api_id
    runtimes = hass.data.get(DOMAIN, {})
    runtime = next(
        (item for item in runtimes.values() if isinstance(item, LogbookRuntime)),
        None,
    )
    if runtime is None or runtime.coordinator.data is None:
        return None

    catalog = runtime.coordinator.data
    return llm_component.LLMTools(
        tools=build_tools(runtime.client, catalog),
        prompt=build_prompt(catalog),
    )
