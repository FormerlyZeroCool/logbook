"""Logbook integration setup."""

from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import LogbookClient
from .const import (
    CONF_API_KEY,
    CONF_REFRESH_INTERVAL,
    DEFAULT_REFRESH_INTERVAL,
    DOMAIN,
    REQUIRED_API_VERSION,
    SERVICE_REFRESH_CATALOG,
)
from .coordinator import LogbookCoordinator
from .exceptions import LogbookApiError, LogbookAuthError, LogbookConnectionError
from .runtime import LogbookRuntime


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the domain and a manual catalog refresh service."""
    del config
    hass.data.setdefault(DOMAIN, {})

    async def async_refresh_catalog(call: ServiceCall) -> None:
        del call
        coordinators = [
            runtime.coordinator
            for runtime in hass.data.get(DOMAIN, {}).values()
            if isinstance(runtime, LogbookRuntime)
        ]
        await asyncio.gather(*(coordinator.async_request_refresh() for coordinator in coordinators))

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_CATALOG):
        hass.services.async_register(DOMAIN, SERVICE_REFRESH_CATALOG, async_refresh_catalog)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Logbook from a UI config entry."""
    client = LogbookClient(
        async_get_clientsession(hass),
        entry.data[CONF_URL],
        entry.data[CONF_API_KEY],
    )
    try:
        capabilities = await client.async_capabilities()
    except LogbookAuthError as err:
        raise ConfigEntryAuthFailed(str(err)) from err
    except (LogbookConnectionError, LogbookApiError) as err:
        raise ConfigEntryNotReady(str(err)) from err

    if str(capabilities.get("apiVersion")) != REQUIRED_API_VERSION:
        raise ConfigEntryNotReady(
            f"Logbook API version {capabilities.get('apiVersion')} is incompatible; expected {REQUIRED_API_VERSION}"
        )
    required = ("idempotency", "voiceCatalog", "latestMultiFieldUpdate")
    features = capabilities.get("features", {})
    missing = [feature for feature in required if not features.get(feature)]
    if missing:
        raise ConfigEntryNotReady(f"Logbook backend is missing required capabilities: {', '.join(missing)}")

    coordinator = LogbookCoordinator(
        hass,
        entry,
        client,
        int(entry.data.get(CONF_REFRESH_INTERVAL, DEFAULT_REFRESH_INTERVAL)),
    )
    await coordinator.async_config_entry_first_refresh()
    runtime = LogbookRuntime(client=client, coordinator=coordinator, capabilities=capabilities)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = runtime
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Logbook entry."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload when URL, key, or refresh interval changes."""
    await hass.config_entries.async_reload(entry.entry_id)
