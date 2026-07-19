"""Compatibility LLM API for Home Assistant releases before contributed tools."""

from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers import llm
from homeassistant.helpers.llm import APIInstance, LLMContext
from homeassistant.util import dt as dt_util

from .prompt import build_prompt
from .runtime import LogbookRuntime
from .time_utils import current_time_context
from .tools import build_tools

_LOGGER = logging.getLogger(__name__)


class LogbookAPI(llm.API):
    """Expose Logbook as a selectable Home Assistant LLM API."""

    def __init__(self, hass: HomeAssistant, runtime: LogbookRuntime) -> None:
        """Initialize the API."""
        super().__init__(hass=hass, id="event_logbook", name="Logbook")
        self.runtime = runtime

    async def async_get_api_instance(self, llm_context: LLMContext) -> APIInstance:
        """Return the current catalog-backed Logbook tools."""
        catalog = self.runtime.coordinator.data
        tools = build_tools(self.runtime.client, catalog)
        _LOGGER.debug(
            "Providing Logbook LLM API tools: %s",
            [tool.name for tool in tools],
        )
        clock = current_time_context(
            self.hass.config.time_zone,
            dt_util.utcnow(),
        )
        return APIInstance(
            api=self,
            api_prompt=build_prompt(catalog, clock),
            llm_context=llm_context,
            tools=tools,
        )
