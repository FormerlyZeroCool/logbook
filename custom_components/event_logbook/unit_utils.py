"""Unit normalization helpers for Logbook LLM tool results."""

from __future__ import annotations

from typing import Any

from .models import CatalogEventType


def _numeric(value: Any) -> float | int | None:
    """Return a JSON numeric value while excluding booleans."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _unit_value(unit: Any, field: str) -> Any:
    """Read a field from a backend unit object when present."""
    if isinstance(unit, dict):
        return unit.get(field)
    return None


def event_with_default_display_unit(
    event: dict[str, Any],
    event_type: CatalogEventType,
) -> dict[str, Any]:
    """Make the event type's default unit the primary LLM measurement.

    The backend stores numeric values in the measurement type's canonical base
    unit and returns that number as ``value``/``canonicalValue``. It also returns
    ``displayValue`` converted to the event type's default unit. LLMs naturally
    pair the short ``value`` and ``unit`` fields, so expose the converted value as
    the primary ``value`` and retain canonical storage fields only as explicitly
    named diagnostics.
    """
    result = dict(event)

    canonical_value = _numeric(event.get("canonicalValue"))
    if canonical_value is None:
        canonical_value = _numeric(event.get("value"))

    display_value = _numeric(event.get("displayValue"))
    default_unit = event.get("defaultUnit")

    unit_key = _unit_value(default_unit, "key") or event_type.default_unit_key
    unit_symbol = (
        _unit_value(default_unit, "symbol")
        or event_type.default_unit_symbol
        or event.get("unit")
    )

    # The current backend supplies displayValue. Keep a defensive fallback so
    # compatible older backends are still represented correctly when their
    # serialized default unit includes conversion metadata.
    if display_value is None and canonical_value is not None:
        scale = _numeric(_unit_value(default_unit, "scaleToBase"))
        offset = _numeric(_unit_value(default_unit, "offsetToBase"))
        if scale not in (None, 0):
            display_value = (canonical_value - (offset or 0)) / scale
        elif unit_key is None:
            # A unitless numeric event has no conversion to perform.
            display_value = canonical_value

    if canonical_value is not None:
        result["canonicalValue"] = canonical_value
        canonical_unit = event.get("canonicalUnit")
        canonical_unit_key = _unit_value(canonical_unit, "key")
        canonical_unit_symbol = _unit_value(canonical_unit, "symbol")
        if canonical_unit_key is not None or canonical_unit_symbol is not None:
            result["canonicalMeasurement"] = {
                "value": canonical_value,
                "unitKey": canonical_unit_key,
                "unit": canonical_unit_symbol,
            }

    if display_value is not None:
        result["value"] = display_value
        result["displayValue"] = display_value
        result["unitKey"] = unit_key
        result["unit"] = unit_symbol
        result["measurement"] = {
            "value": display_value,
            "unitKey": unit_key,
            "unit": unit_symbol,
        }

    return result
