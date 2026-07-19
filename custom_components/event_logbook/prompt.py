"""Dynamic LLM prompt generation for Logbook."""

from __future__ import annotations

from .models import VoiceCatalog
from .time_utils import CurrentTimeContext

BASE_PROMPT = """You have access to native Logbook tools for recording and retrieving household events.

Tool selection rules:
- Use LogbookLogPointEvent for an observation that happens at one moment, such as weight, water intake, medication taken, or a measurement.
- Use LogbookStartDurationEvent when an activity begins, such as a walk, workout, sleep, charging session, or feeding session.
- Use LogbookFinishDurationEvent when the user says that an ongoing activity has ended.
- Use LogbookGetLatestEvent when the user asks when the latest event started or ended, whether it is still ongoing, what its value was, or what notes it contains.
- Use LogbookUpdateLatestEvent when the user corrects the start time, value, unit, text, or note of the most recent event.
- Use LogbookListEventTypes when the user asks what can be recorded or when the intended event type remains genuinely ambiguous after consulting the catalog below.
- Always provide an exact existing event_type_key. Do not invent new event types.
- Use only a unit_key listed as compatible with the chosen event type. Do not invent unit keys.
- Event types do not have a permanently fixed point/duration mode. Choose point versus duration based on what the user says happened.
- Omit fields the user did not supply. Never invent a value, unit, text, note, start time, or finish time.
- The Current Home Assistant clock below is authoritative for the current date and time.
- When the user says now, just now, or gives no time, omit the timestamp argument. The integration inserts the current Home Assistant time.
- For a time in the Home Assistant local timezone, pass a local ISO 8601 wall-clock value without `Z`, for example `2026-07-18T21:21:00`. The integration applies the configured timezone and converts it to UTC.
- Never append `Z` to a local wall-clock time. `Z` means the supplied time is already UTC.
- For a time explicitly stated in another timezone, pass an ISO 8601 value with the correct numeric offset.
- Resolve relative times from the authoritative current local time below before calling a tool.
- After a tool runs, relay its returned result to the user.
- For numeric tool results, report `event.measurement.value` with `event.measurement.unit` (or `unitKey`). The integration has already converted that measurement to the event type's configured default display unit.
- `event.canonicalValue` and `event.canonicalMeasurement` describe backend storage units only. Never pair a canonical value with the display unit, and do not expose canonical storage values unless the user explicitly asks for them.
- Call the exact tool name offered by Home Assistant. On Home Assistant 2026.7, when Logbook and Assist are selected together, Logbook tool names are prefixed with `Logbook__`, for example `Logbook__LogbookGetLatestEvent`.

Default response style:
- When the user asks about an event, respond in the form: `{event type} happened at {start time human readable} {end time human readable} with {value}{unit} {note}`.
- Omit segments whose values are absent. For an ongoing duration event, say that it is ongoing instead of inventing an end time.
- Use the user's local, human-readable time rather than exposing raw ISO timestamps unless they ask for exact timestamps.
"""


def build_prompt(catalog: VoiceCatalog, clock: CurrentTimeContext) -> str:
    """Build the per-request prompt fragment with the current exact catalog and clock."""
    lines = [
        BASE_PROMPT.rstrip(),
        "",
        "Current Home Assistant clock (authoritative):",
        f"- Time zone: {clock.timezone_name} ({clock.timezone_abbreviation})",
        f"- Local time: {clock.local_human}",
        f"- Local ISO: {clock.local_iso}",
        f"- UTC ISO: {clock.utc_iso}",
        "",
        "Current Logbook catalog:",
    ]
    if not catalog.event_types:
        lines.append("- No active event types are currently configured.")
        return "\n".join(lines)

    for event_type in catalog.event_types:
        details: list[str] = []
        if event_type.description:
            details.append(f"description={event_type.description}")
        if event_type.voice_aliases:
            details.append(f"voice aliases={', '.join(event_type.voice_aliases)}")
        if event_type.default_unit_key:
            details.append(
                f"default unit={event_type.default_unit_key}"
                + (f" ({event_type.default_unit_symbol})" if event_type.default_unit_symbol else "")
            )
        if event_type.units:
            units = ", ".join(
                f"{unit.key} ({unit.symbol}; aliases: {', '.join(unit.aliases)})"
                if unit.aliases
                else f"{unit.key} ({unit.symbol})"
                for unit in event_type.units
            )
            details.append(f"compatible units={units}")
        else:
            details.append("compatible units=none")
        lines.append(f"- {event_type.key} — {event_type.name}: " + "; ".join(details))

    return "\n".join(lines)
