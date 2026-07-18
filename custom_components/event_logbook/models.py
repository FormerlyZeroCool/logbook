"""Data models for the Logbook integration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class CatalogUnit:
    """A unit that may be supplied to Logbook."""

    key: str
    name: str
    symbol: str
    aliases: tuple[str, ...]
    is_base: bool

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "CatalogUnit":
        return cls(
            key=str(value["key"]),
            name=str(value.get("name") or value["key"]),
            symbol=str(value.get("symbol") or value["key"]),
            aliases=tuple(str(item) for item in value.get("aliases", [])),
            is_base=bool(value.get("isBase", False)),
        )


@dataclass(frozen=True, slots=True)
class CatalogEventType:
    """An active event type with voice metadata and compatible units."""

    key: str
    name: str
    description: str | None
    voice_aliases: tuple[str, ...]
    unit_type_key: str | None
    unit_type_name: str | None
    default_unit_key: str | None
    default_unit_symbol: str | None
    units: tuple[CatalogUnit, ...]

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "CatalogEventType":
        unit_type = value.get("unitType") or {}
        default_unit = value.get("defaultUnit") or {}
        return cls(
            key=str(value["key"]),
            name=str(value.get("name") or value["key"]),
            description=value.get("description"),
            voice_aliases=tuple(str(item) for item in value.get("voiceAliases", [])),
            unit_type_key=unit_type.get("key"),
            unit_type_name=unit_type.get("name"),
            default_unit_key=default_unit.get("key"),
            default_unit_symbol=default_unit.get("symbol"),
            units=tuple(CatalogUnit.from_dict(item) for item in value.get("units", [])),
        )

    @property
    def unit_keys(self) -> tuple[str, ...]:
        """Return compatible exact unit keys."""
        return tuple(unit.key for unit in self.units)


@dataclass(frozen=True, slots=True)
class VoiceCatalog:
    """The complete active catalog supplied to the LLM."""

    api_version: str
    event_types: tuple[CatalogEventType, ...]

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "VoiceCatalog":
        return cls(
            api_version=str(value.get("apiVersion", "")),
            event_types=tuple(
                CatalogEventType.from_dict(item)
                for item in value.get("eventTypes", [])
            ),
        )

    @property
    def by_key(self) -> dict[str, CatalogEventType]:
        """Return event types indexed by exact key."""
        return {event_type.key: event_type for event_type in self.event_types}

    @property
    def event_type_keys(self) -> tuple[str, ...]:
        """Return active event type keys."""
        return tuple(event_type.key for event_type in self.event_types)

    @property
    def all_unit_keys(self) -> tuple[str, ...]:
        """Return all known unit keys without duplicates."""
        return tuple(dict.fromkeys(
            unit.key
            for event_type in self.event_types
            for unit in event_type.units
        ))
