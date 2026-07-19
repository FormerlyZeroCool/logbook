"""Time parsing and normalization helpers for Logbook tools."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class LogbookTimeError(ValueError):
    """Raised when an LLM supplied timestamp cannot be interpreted safely."""


@dataclass(frozen=True, slots=True)
class CurrentTimeContext:
    """Current Home Assistant clock values supplied to the LLM prompt."""

    timezone_name: str
    timezone_abbreviation: str
    local_datetime: datetime
    utc_datetime: datetime

    @property
    def local_iso(self) -> str:
        """Return local time as an offset-aware ISO 8601 value."""
        return self.local_datetime.isoformat(timespec="seconds")

    @property
    def utc_iso(self) -> str:
        """Return UTC time in canonical Z form."""
        return _format_utc(self.utc_datetime)

    @property
    def local_human(self) -> str:
        """Return a compact human-readable local time for the prompt."""
        return self.local_datetime.strftime("%A, %B %-d, %Y at %-I:%M:%S %p %Z")


def _zone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as err:
        raise LogbookTimeError(f"Unknown Home Assistant time zone: {timezone_name}") from err


def _format_utc(value: datetime) -> str:
    """Return an aware datetime in canonical UTC ISO form."""
    if value.tzinfo is None:
        raise LogbookTimeError("UTC datetime must include timezone information")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def current_time_context(timezone_name: str, now_utc: datetime) -> CurrentTimeContext:
    """Build prompt clock context from an injected UTC instant."""
    if now_utc.tzinfo is None:
        raise LogbookTimeError("Current time must include timezone information")
    local = now_utc.astimezone(_zone(timezone_name))
    return CurrentTimeContext(
        timezone_name=timezone_name,
        timezone_abbreviation=local.tzname() or timezone_name,
        local_datetime=local,
        utc_datetime=now_utc.astimezone(timezone.utc),
    )


def normalize_timestamp_to_utc(
    value: str | None,
    *,
    timezone_name: str,
    now_utc: datetime,
) -> str:
    """Normalize an optional LLM timestamp to canonical UTC.

    Missing values mean "now" and use the Home Assistant integration's clock.
    Naive ISO values are interpreted as local wall-clock time in Home Assistant's
    configured IANA timezone. Offset-aware values preserve their represented
    instant and are converted exactly once to UTC.
    """
    if value is None or not value.strip():
        return _format_utc(now_utc)

    raw = value.strip()
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as err:
        raise LogbookTimeError(
            "Timestamp must be ISO 8601. Use local wall-clock form such as "
            "2026-07-18T21:21:00, or include an explicit offset such as "
            "2026-07-18T21:21:00-04:00."
        ) from err

    if parsed.tzinfo is None:
        zone = _zone(timezone_name)
        first = parsed.replace(tzinfo=zone, fold=0)
        second = parsed.replace(tzinfo=zone, fold=1)
        if first.utcoffset() != second.utcoffset():
            raise LogbookTimeError(
                "Local timestamp is ambiguous because of a daylight-saving transition; "
                "include an explicit numeric UTC offset."
            )
        round_trip = first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
        if round_trip != parsed:
            raise LogbookTimeError(
                "Local timestamp does not exist because of a daylight-saving transition; "
                "provide a valid local time with an explicit offset."
            )
        parsed = first

    return _format_utc(parsed)


def event_with_local_times(event: dict, timezone_name: str) -> dict:
    """Add local ISO forms beside backend UTC event timestamps."""
    result = dict(event)
    zone = _zone(timezone_name)
    for api_name, local_name in (("startedAt", "startedAtLocal"), ("endedAt", "endedAtLocal")):
        value = event.get(api_name)
        if not value:
            result[local_name] = None
            continue
        raw = str(value)
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            result[local_name] = None
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        result[local_name] = parsed.astimezone(zone).isoformat(timespec="seconds")
    result["timeZone"] = timezone_name
    return result
