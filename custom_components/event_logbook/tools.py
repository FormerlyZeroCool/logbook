"""Native LLM tools for Logbook."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import llm
from homeassistant.helpers.llm import LLMContext, ToolInput
from homeassistant.util import dt as dt_util
from homeassistant.util.json import JsonObjectType

from .api import LogbookClient
from .exceptions import LogbookApiError
from .models import CatalogEventType, VoiceCatalog
from .time_utils import LogbookTimeError, event_with_local_times, normalize_timestamp_to_utc

_LOGGER = logging.getLogger(__name__)


class LogbookToolError(HomeAssistantError):
    """A user-facing Logbook tool failure."""


def _optional_payload(args: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for tool_name, api_name in mapping.items():
        if tool_name in args:
            payload[api_name] = args[tool_name]
    return payload


def _result(hass: HomeAssistant, action: str, event: dict[str, Any]) -> JsonObjectType:
    return {
        "success": True,
        "action": action,
        "event": event_with_local_times(event, hass.config.time_zone),
        "instruction": "Relay this result to the user using the supplied local timestamps and omit absent fields.",
    }


def _utc_timestamp(hass: HomeAssistant, value: str | None) -> str:
    try:
        return normalize_timestamp_to_utc(
            value,
            timezone_name=hass.config.time_zone,
            now_utc=dt_util.utcnow(),
        )
    except LogbookTimeError as err:
        raise LogbookToolError(str(err)) from err


def _raise_tool_error(err: LogbookApiError) -> None:
    prefix = {
        "not_found": "Not found",
        "conflict": "Conflict",
        "validation_error": "Invalid request",
        "idempotency_in_progress": "Request still in progress",
    }.get(err.code or "", "Logbook request failed")
    raise LogbookToolError(f"{prefix}: {err}") from err


class BaseLogbookTool(llm.Tool):
    """Base class that shares the backend client and current catalog."""

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        self.client = client
        self.catalog = catalog
        self.event_types = catalog.by_key

    def _log_call(self, tool_input: ToolInput) -> None:
        """Log a safe summary of a tool invocation."""
        _LOGGER.debug(
            "Invoking %s with fields=%s event_type_key=%s",
            self.name,
            sorted(tool_input.tool_args),
            tool_input.tool_args.get("event_type_key"),
        )

    def _event_type(self, key: str) -> CatalogEventType:
        event_type = self.event_types.get(key)
        if event_type is None:
            raise LogbookToolError(f"Unknown event type key: {key}")
        return event_type

    def _validate_unit(self, event_type: CatalogEventType, args: dict[str, Any]) -> None:
        if "unit_key" not in args or args["unit_key"] is None:
            return
        unit_key = str(args["unit_key"])
        if unit_key not in event_type.unit_keys:
            compatible = ", ".join(event_type.unit_keys) or "none"
            raise LogbookToolError(
                f"Unit {unit_key} is not compatible with {event_type.key}. Compatible units: {compatible}."
            )
        if "value" not in args or args["value"] is None:
            raise LogbookToolError("unit_key may only be supplied together with a numeric value")


class ListEventTypesTool(BaseLogbookTool):
    name = "LogbookListEventTypes"
    description = "List the exact active Logbook event type keys, aliases, and compatible units."
    parameters = vol.Schema({})

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del hass, llm_context
        self._log_call(tool_input)
        return {
            "success": True,
            "eventTypes": [
                {
                    "key": event_type.key,
                    "name": event_type.name,
                    "description": event_type.description,
                    "voiceAliases": list(event_type.voice_aliases),
                    "defaultUnitKey": event_type.default_unit_key,
                    "compatibleUnitKeys": list(event_type.unit_keys),
                }
                for event_type in self.catalog.event_types
            ],
        }


class LogPointEventTool(BaseLogbookTool):
    name = "LogbookLogPointEvent"
    description = "Record a point-in-time observation using an exact existing event type key."

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required("event_type_key"): vol.In(catalog.event_type_keys),
            vol.Optional("occurred_at", description="Local ISO 8601 wall-clock time in Home Assistant timezone; omit for now. Explicit offsets are also accepted."): str,
            vol.Optional("value"): vol.Coerce(float),
            vol.Optional("unit_key"): vol.Any(None, vol.In(catalog.all_unit_keys)),
            vol.Optional("text_value"): vol.Any(None, str),
            vol.Optional("note"): vol.Any(None, str),
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        args = tool_input.tool_args
        event_type = self._event_type(args["event_type_key"])
        self._validate_unit(event_type, args)
        payload = {
            "eventTypeKey": event_type.key,
            "occurredAt": _utc_timestamp(hass, args.get("occurred_at")),
        }
        payload.update(_optional_payload(args, {
            "value": "value", "unit_key": "unitKey",
            "text_value": "textValue", "note": "note",
        }))
        try:
            return _result(hass, "logged_point_event", await self.client.async_log_point(payload, tool_input.id))
        except LogbookApiError as err:
            _raise_tool_error(err)


class StartDurationEventTool(BaseLogbookTool):
    name = "LogbookStartDurationEvent"
    description = "Start an ongoing duration event using an exact existing event type key."

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required("event_type_key"): vol.In(catalog.event_type_keys),
            vol.Optional("started_at", description="Local ISO 8601 wall-clock time in Home Assistant timezone; omit for now. Explicit offsets are also accepted."): str,
            vol.Optional("value"): vol.Coerce(float),
            vol.Optional("unit_key"): vol.Any(None, vol.In(catalog.all_unit_keys)),
            vol.Optional("text_value"): vol.Any(None, str),
            vol.Optional("note"): vol.Any(None, str),
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        args = tool_input.tool_args
        event_type = self._event_type(args["event_type_key"])
        self._validate_unit(event_type, args)
        payload = {
            "eventTypeKey": event_type.key,
            "startedAt": _utc_timestamp(hass, args.get("started_at")),
        }
        payload.update(_optional_payload(args, {
            "value": "value", "unit_key": "unitKey",
            "text_value": "textValue", "note": "note",
        }))
        try:
            return _result(hass, "started_duration_event", await self.client.async_start_duration(payload, tool_input.id))
        except LogbookApiError as err:
            _raise_tool_error(err)


class FinishDurationEventTool(BaseLogbookTool):
    name = "LogbookFinishDurationEvent"
    description = "Finish the newest ongoing duration event for an exact existing event type key."

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required("event_type_key"): vol.In(catalog.event_type_keys),
            vol.Optional("ended_at", description="Local ISO 8601 wall-clock time in Home Assistant timezone; omit for now. Explicit offsets are also accepted."): str,
            vol.Optional("value"): vol.Coerce(float),
            vol.Optional("unit_key"): vol.Any(None, vol.In(catalog.all_unit_keys)),
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        args = tool_input.tool_args
        event_type = self._event_type(args["event_type_key"])
        self._validate_unit(event_type, args)
        payload = {
            "eventTypeKey": event_type.key,
            "endedAt": _utc_timestamp(hass, args.get("ended_at")),
        }
        payload.update(_optional_payload(args, {
            "value": "value", "unit_key": "unitKey",
        }))
        try:
            return _result(hass, "finished_duration_event", await self.client.async_finish_duration(payload, tool_input.id))
        except LogbookApiError as err:
            _raise_tool_error(err)


class GetLatestEventTool(BaseLogbookTool):
    name = "LogbookGetLatestEvent"
    description = "Get the latest event's start, finish, ongoing state, value, text, and note."

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required("event_type_key"): vol.In(catalog.event_type_keys),
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        event_type = self._event_type(tool_input.tool_args["event_type_key"])
        try:
            return _result(hass, "retrieved_latest_event", await self.client.async_get_latest(event_type.key))
        except LogbookApiError as err:
            _raise_tool_error(err)


class UpdateLatestEventTool(BaseLogbookTool):
    name = "LogbookUpdateLatestEvent"
    description = "Correct one or more fields on the latest event in a single atomic update."

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required("event_type_key"): vol.In(catalog.event_type_keys),
            vol.Optional("started_at", description="Local ISO 8601 wall-clock time in Home Assistant timezone. Explicit offsets are also accepted."): str,
            vol.Optional("value"): vol.Any(None, vol.Coerce(float)),
            vol.Optional("unit_key"): vol.Any(None, vol.In(catalog.all_unit_keys)),
            vol.Optional("text_value"): vol.Any(None, str),
            vol.Optional("note"): vol.Any(None, str),
            vol.Optional("metadata"): dict,
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        args = tool_input.tool_args
        event_type = self._event_type(args["event_type_key"])
        editable = {key: value for key, value in args.items() if key != "event_type_key"}
        if not editable:
            raise LogbookToolError("Provide at least one field to update")
        self._validate_unit(event_type, args)
        payload = _optional_payload(args, {
            "value": "value", "unit_key": "unitKey",
            "text_value": "textValue", "note": "note", "metadata": "metadata",
        })
        if "started_at" in args:
            payload["startedAt"] = _utc_timestamp(hass, args.get("started_at"))
        try:
            return _result(
                hass,
                "updated_latest_event",
                await self.client.async_update_latest(event_type.key, payload, tool_input.id),
            )
        except LogbookApiError as err:
            _raise_tool_error(err)


def build_tools(client: LogbookClient, catalog: VoiceCatalog) -> list[llm.Tool]:
    """Build tools with schemas constrained to the current catalog."""
    tools: list[llm.Tool] = [ListEventTypesTool(client, catalog)]
    if not catalog.event_types:
        return tools
    tools.extend([
        LogPointEventTool(client, catalog),
        StartDurationEventTool(client, catalog),
        FinishDurationEventTool(client, catalog),
        GetLatestEventTool(client, catalog),
        UpdateLatestEventTool(client, catalog),
    ])
    return tools
