"""UI configuration flow for Logbook."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import LogbookClient, normalize_base_url
from .const import (
    CONF_API_KEY,
    CONF_REFRESH_INTERVAL,
    DEFAULT_REFRESH_INTERVAL,
    DOMAIN,
    MAX_REFRESH_INTERVAL,
    MIN_REFRESH_INTERVAL,
    REQUIRED_API_VERSION,
)
from .exceptions import LogbookApiError, LogbookAuthError, LogbookConnectionError


def _schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    return vol.Schema({
        vol.Required(CONF_URL, default=defaults.get(CONF_URL, "http://192.168.68.62:8787")): str,
        vol.Required(CONF_API_KEY, default=defaults.get(CONF_API_KEY, "")): str,
        vol.Required(
            CONF_REFRESH_INTERVAL,
            default=defaults.get(CONF_REFRESH_INTERVAL, DEFAULT_REFRESH_INTERVAL),
        ): vol.All(vol.Coerce(int), vol.Range(min=MIN_REFRESH_INTERVAL, max=MAX_REFRESH_INTERVAL)),
    })


async def _validate(hass, user_input: dict[str, Any]) -> dict[str, Any]:
    base_url = normalize_base_url(user_input[CONF_URL])
    client = LogbookClient(async_get_clientsession(hass), base_url, user_input[CONF_API_KEY])
    capabilities = await client.async_capabilities()
    if str(capabilities.get("apiVersion")) != REQUIRED_API_VERSION:
        raise LogbookApiError(
            f"Unsupported API version {capabilities.get('apiVersion')}; expected {REQUIRED_API_VERSION}",
            code="unsupported_api",
        )
    features = capabilities.get("features", {})
    missing = [name for name in ("idempotency", "voiceCatalog", "latestMultiFieldUpdate") if not features.get(name)]
    if missing:
        raise LogbookApiError(f"Backend is missing required capabilities: {', '.join(missing)}", code="missing_features")
    catalog = await client.async_voice_catalog()
    return {
        CONF_URL: base_url,
        CONF_API_KEY: user_input[CONF_API_KEY],
        CONF_REFRESH_INTERVAL: user_input[CONF_REFRESH_INTERVAL],
        "title": urlsplit(base_url).hostname or "Logbook",
        "event_type_count": len(catalog.event_types),
    }


class LogbookConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure a local Logbook backend."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                validated = await _validate(self.hass, user_input)
            except ValueError:
                errors["base"] = "invalid_url"
            except LogbookAuthError:
                errors["base"] = "invalid_auth"
            except LogbookConnectionError:
                errors["base"] = "cannot_connect"
            except LogbookApiError:
                errors["base"] = "unsupported_backend"
            else:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured()
                title = f"Logbook ({validated['title']})"
                data = {key: validated[key] for key in (CONF_URL, CONF_API_KEY, CONF_REFRESH_INTERVAL)}
                return self.async_create_entry(title=title, data=data)

        return self.async_show_form(step_id="user", data_schema=_schema(user_input), errors=errors)

    async def async_step_reauth(self, entry_data: dict[str, Any]):
        """Start reauthentication after the backend rejects the API key."""
        del entry_data
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None):
        """Validate and store a replacement API key."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            merged = {**entry.data, **user_input}
            try:
                validated = await _validate(self.hass, merged)
            except LogbookAuthError:
                errors["base"] = "invalid_auth"
            except LogbookConnectionError:
                errors["base"] = "cannot_connect"
            except (LogbookApiError, ValueError):
                errors["base"] = "unsupported_backend"
            else:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={
                        key: validated[key]
                        for key in (CONF_URL, CONF_API_KEY, CONF_REFRESH_INTERVAL)
                    },
                    reason="reauth_successful",
                )
        schema = vol.Schema({vol.Required(CONF_API_KEY, default=""): str})
        return self.async_show_form(step_id="reauth_confirm", data_schema=schema, errors=errors)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None):
        """Allow the backend URL, key, and catalog interval to be changed."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                validated = await _validate(self.hass, user_input)
            except ValueError:
                errors["base"] = "invalid_url"
            except LogbookAuthError:
                errors["base"] = "invalid_auth"
            except LogbookConnectionError:
                errors["base"] = "cannot_connect"
            except LogbookApiError:
                errors["base"] = "unsupported_backend"
            else:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={
                        key: validated[key]
                        for key in (CONF_URL, CONF_API_KEY, CONF_REFRESH_INTERVAL)
                    },
                    reason="reconfigure_successful",
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=_schema(user_input or dict(entry.data)),
            errors=errors,
        )
