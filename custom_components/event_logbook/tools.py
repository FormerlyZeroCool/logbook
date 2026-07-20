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
from .unit_utils import event_with_default_display_unit

_LOGGER = logging.getLogger(__name__)


EVENT_TYPE_KEY_DESCRIPTION = (
    "Required. Exact existing event type key from the current Logbook catalog."
)
NOW_OR_EXPLICIT_TIME_DESCRIPTION = (
    "Optional. Omit when the user means now or gave no time; the integration "
    "inserts the current Home Assistant time. Otherwise supply local ISO 8601 "
    "without Z, or an offset-aware ISO 8601 value."
)
OPTIONAL_VALUE_DESCRIPTION = (
    "Optional. Numeric measurement supplied by the user. Omit when no numeric "
    "value was given."
)
OPTIONAL_UNIT_DESCRIPTION = (
    "Optional. Exact compatible unit key for value. Include only together with "
    "a numeric value. Omit to use the event type's configured default unit."
)
OPTIONAL_TEXT_DESCRIPTION = (
    "Optional. Text measurement supplied by the user. Omit when absent; this is "
    "separate from note."
)
OPTIONAL_NOTE_DESCRIPTION = (
    "Optional. User-provided note. Omit when absent."
)


class LogbookToolError(HomeAssistantError):
    """A user-facing Logbook tool failure."""


def _optional_payload(args: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for tool_name, api_name in mapping.items():
        if tool_name in args:
            payload[api_name] = args[tool_name]
    return payload


def _result(
    hass: HomeAssistant,
    action: str,
    event: dict[str, Any],
    event_type: CatalogEventType,
) -> JsonObjectType:
    normalized = event_with_default_display_unit(event, event_type)
    return {
        "success": True,
        "action": action,
        "event": event_with_local_times(normalized, hass.config.time_zone),
        "instruction": (
            "Relay this result using event.measurement.value with "
            "event.measurement.unit. That measurement is already converted to "
            "the event type's default display unit. Do not report "
            "event.canonicalValue as though it used the display unit. Use the "
            "supplied local timestamps and omit absent fields."
        ),
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
    description = (
        "List the exact active Logbook event type keys, aliases, default units, "
        "and compatible units. This tool takes no arguments."
    )
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
                    "defaultUnitSymbol": event_type.default_unit_symbol,
                    "compatibleUnitKeys": list(event_type.unit_keys),
                }
                for event_type in self.catalog.event_types
            ],
        }


class LogPointEventTool(BaseLogbookTool):
    name = "LogbookLogPointEvent"
    description = (
        "Record one point-in-time observation. Required field: event_type_key. "
        "Optional fields: occurred_at, value, unit_key, text_value, note. Omit "
        "every optional field the user did not provide. Omit occurred_at for "
        "now. unit_key is optional, may only accompany value, and should be "
        "omitted to use the event type's default unit."
    )

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required(
                "event_type_key", description=EVENT_TYPE_KEY_DESCRIPTION
            ): vol.In(catalog.event_type_keys),
            vol.Optional(
                "occurred_at", description=NOW_OR_EXPLICIT_TIME_DESCRIPTION
            ): str,
            vol.Optional("value", description=OPTIONAL_VALUE_DESCRIPTION): vol.Coerce(float),
            vol.Optional("unit_key", description=OPTIONAL_UNIT_DESCRIPTION): vol.In(
                catalog.all_unit_keys
            ),
            vol.Optional("text_value", description=OPTIONAL_TEXT_DESCRIPTION): str,
            vol.Optional("note", description=OPTIONAL_NOTE_DESCRIPTION): str,
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
            return _result(hass, "logged_point_event", await self.client.async_log_point(payload, tool_input.id), event_type)
        except LogbookApiError as err:
            _raise_tool_error(err)


class StartDurationEventTool(BaseLogbookTool):
    name = "LogbookStartDurationEvent"
    description = (
        "Start one ongoing duration event. Required field: event_type_key. "
        "Optional fields: started_at, value, unit_key, text_value, note. Omit "
        "every optional field the user did not provide. Omit started_at for "
        "now. unit_key is optional, may only accompany value, and should be "
        "omitted to use the event type's default unit."
    )

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required(
                "event_type_key", description=EVENT_TYPE_KEY_DESCRIPTION
            ): vol.In(catalog.event_type_keys),
            vol.Optional(
                "started_at", description=NOW_OR_EXPLICIT_TIME_DESCRIPTION
            ): str,
            vol.Optional("value", description=OPTIONAL_VALUE_DESCRIPTION): vol.Coerce(float),
            vol.Optional("unit_key", description=OPTIONAL_UNIT_DESCRIPTION): vol.In(
                catalog.all_unit_keys
            ),
            vol.Optional("text_value", description=OPTIONAL_TEXT_DESCRIPTION): str,
            vol.Optional("note", description=OPTIONAL_NOTE_DESCRIPTION): str,
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
            return _result(hass, "started_duration_event", await self.client.async_start_duration(payload, tool_input.id), event_type)
        except LogbookApiError as err:
            _raise_tool_error(err)


class FinishDurationEventTool(BaseLogbookTool):
    name = "LogbookFinishDurationEvent"
    description = (
        "Finish the newest ongoing duration event. Required field: "
        "event_type_key. Optional fields: ended_at, value, unit_key. Omit "
        "ended_at for now. Omit value to preserve the event's existing value. "
        "unit_key is optional, may only accompany value, and should be omitted "
        "to use the event type's default unit."
    )

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required(
                "event_type_key", description=EVENT_TYPE_KEY_DESCRIPTION
            ): vol.In(catalog.event_type_keys),
            vol.Optional(
                "ended_at", description=NOW_OR_EXPLICIT_TIME_DESCRIPTION
            ): str,
            vol.Optional(
                "value",
                description=(
                    "Optional. Final numeric measurement to set while finishing. "
                    "Omit to preserve the event's existing numeric value."
                ),
            ): vol.Coerce(float),
            vol.Optional("unit_key", description=OPTIONAL_UNIT_DESCRIPTION): vol.In(
                catalog.all_unit_keys
            ),
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
            return _result(hass, "finished_duration_event", await self.client.async_finish_duration(payload, tool_input.id), event_type)
        except LogbookApiError as err:
            _raise_tool_error(err)


class GetLatestEventTool(BaseLogbookTool):
    name = "LogbookGetLatestEvent"
    description = (
        "Get the latest event, including local timestamps, ongoing state, text, "
        "note, and numeric measurement converted to the event type's default "
        "display unit. Required field: event_type_key. There are no optional "
        "fields."
    )

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required(
                "event_type_key", description=EVENT_TYPE_KEY_DESCRIPTION
            ): vol.In(catalog.event_type_keys),
        }, extra=vol.PREVENT_EXTRA)

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> JsonObjectType:
        del llm_context
        self._log_call(tool_input)
        event_type = self._event_type(tool_input.tool_args["event_type_key"])
        try:
            return _result(hass, "retrieved_latest_event", await self.client.async_get_latest(event_type.key), event_type)
        except LogbookApiError as err:
            _raise_tool_error(err)


class UpdateLatestEventTool(BaseLogbookTool):
    name = "LogbookUpdateLatestEvent"
    description = (
        "Correct the latest event in one atomic update. Required field: "
        "event_type_key. Also provide at least one optional correction field: "
        "started_at, value, unit_key, text_value, note, or metadata. Omitted "
        "fields remain unchanged. value, text_value, and note may be null to "
        "clear them. unit_key may only accompany a non-null numeric value; omit "
        "it to use the event type's default unit."
    )

    def __init__(self, client: LogbookClient, catalog: VoiceCatalog) -> None:
        super().__init__(client, catalog)
        self.parameters = vol.Schema({
            vol.Required(
                "event_type_key", description=EVENT_TYPE_KEY_DESCRIPTION
            ): vol.In(catalog.event_type_keys),
            vol.Optional(
                "started_at",
                description=(
                    "Optional. New start time. Omit to leave the current start time "
                    "unchanged. Use local ISO 8601 without Z or an offset-aware ISO "
                    "8601 value."
                ),
            ): str,
            vol.Optional(
                "value",
                description=(
                    "Optional. New numeric value. Omit to leave unchanged; use null "
                    "to clear the numeric value."
                ),
            ): vol.Any(None, vol.Coerce(float)),
            vol.Optional(
                "unit_key",
                description=(
                    "Optional. Exact compatible unit key for a non-null numeric "
                    "value. Omit to use the event type's default unit. Do not send "
                    "when value is omitted or null."
                ),
            ): vol.In(catalog.all_unit_keys),
            vol.Optional(
                "text_value",
                description=(
                    "Optional. New text measurement. Omit to leave unchanged; use "
                    "null to clear it."
                ),
            ): vol.Any(None, str),
            vol.Optional(
                "note",
                description=(
                    "Optional. New note. Omit to leave unchanged; use null to clear "
                    "it."
                ),
            ): vol.Any(None, str),
            vol.Optional(
                "metadata",
                description=(
                    "Optional. Replacement metadata object. Omit to leave metadata "
                    "unchanged; supply only when the user explicitly provides "
                    "structured metadata."
                ),
            ): dict,
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
                event_type,
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
