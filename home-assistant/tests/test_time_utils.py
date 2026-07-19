from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import sys
import types

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT.parent / "custom_components" / "event_logbook"
PACKAGE_NAME = "logbook_time_testpkg"


def _load_module(name: str, filename: str):
    full_name = f"{PACKAGE_NAME}.{name}"
    spec = importlib.util.spec_from_file_location(full_name, COMPONENT / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    spec.loader.exec_module(module)
    return module


package = types.ModuleType(PACKAGE_NAME)
package.__path__ = [str(COMPONENT)]
sys.modules[PACKAGE_NAME] = package
time_utils = _load_module("time_utils", "time_utils.py")


def test_missing_timestamp_uses_integration_clock_in_utc():
    now = datetime(2026, 7, 19, 1, 20, 32, 123456, tzinfo=timezone.utc)
    assert time_utils.normalize_timestamp_to_utc(
        None,
        timezone_name="America/New_York",
        now_utc=now,
    ) == "2026-07-19T01:20:32.123Z"


def test_naive_local_edt_time_is_converted_once_to_utc():
    assert time_utils.normalize_timestamp_to_utc(
        "2026-07-18T21:21:00",
        timezone_name="America/New_York",
        now_utc=datetime(2026, 7, 19, 1, 20, tzinfo=timezone.utc),
    ) == "2026-07-19T01:21:00.000Z"


def test_offset_aware_edt_time_preserves_the_same_instant():
    assert time_utils.normalize_timestamp_to_utc(
        "2026-07-18T21:21:00-04:00",
        timezone_name="America/New_York",
        now_utc=datetime(2026, 7, 19, 1, 20, tzinfo=timezone.utc),
    ) == "2026-07-19T01:21:00.000Z"


def test_utc_input_is_not_shifted_again():
    assert time_utils.normalize_timestamp_to_utc(
        "2026-07-19T01:21:00Z",
        timezone_name="America/New_York",
        now_utc=datetime(2026, 7, 19, 1, 20, tzinfo=timezone.utc),
    ) == "2026-07-19T01:21:00.000Z"


def test_prompt_clock_contains_local_and_utc_views_of_same_instant():
    clock = time_utils.current_time_context(
        "America/New_York",
        datetime(2026, 7, 19, 1, 20, 32, tzinfo=timezone.utc),
    )
    assert clock.timezone_abbreviation == "EDT"
    assert clock.local_iso == "2026-07-18T21:20:32-04:00"
    assert clock.utc_iso == "2026-07-19T01:20:32.000Z"


def test_ambiguous_naive_dst_time_requires_explicit_offset():
    with pytest.raises(time_utils.LogbookTimeError, match="ambiguous"):
        time_utils.normalize_timestamp_to_utc(
            "2026-11-01T01:30:00",
            timezone_name="America/New_York",
            now_utc=datetime(2026, 11, 1, 5, 0, tzinfo=timezone.utc),
        )
