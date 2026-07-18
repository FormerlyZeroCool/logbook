"""Diagnostics support for Logbook."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_API_KEY, DOMAIN
from .runtime import LogbookRuntime


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict:
    """Return redacted diagnostics without event contents."""
    runtime = hass.data[DOMAIN][entry.entry_id]
    assert isinstance(runtime, LogbookRuntime)
    catalog = runtime.coordinator.data
    redacted = dict(entry.data)
    redacted[CONF_API_KEY] = "**REDACTED**"
    return {
        "config": redacted,
        "capabilities": runtime.capabilities,
        "catalog": {
            "last_update_success": runtime.coordinator.last_update_success,
            "event_type_count": len(catalog.event_types) if catalog else 0,
            "event_type_keys": list(catalog.event_type_keys) if catalog else [],
        },
    }
