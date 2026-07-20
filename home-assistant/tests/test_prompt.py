from __future__ import annotations

import ast
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT.parent / "custom_components" / "event_logbook"
PACKAGE_NAME = "logbook_testpkg"


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
models = _load_module("models", "models.py")
time_utils = _load_module("time_utils", "time_utils.py")
prompt_module = _load_module("prompt", "prompt.py")
VoiceCatalog = models.VoiceCatalog
build_prompt = prompt_module.build_prompt
CurrentTimeContext = time_utils.CurrentTimeContext


def sample_catalog():
    return VoiceCatalog.from_dict({
        "apiVersion": "1",
        "eventTypes": [{
            "key": "feeding_jay",
            "name": "Feeding Jay",
            "description": "Bottle and nursing feedings",
            "voiceAliases": ["feed Jay", "Jay feeding"],
            "unitType": {"key": "volume", "name": "Volume"},
            "defaultUnit": {"key": "fl_oz_us", "symbol": "fl oz"},
            "units": [
                {"key": "ml", "name": "Milliliter", "symbol": "mL", "aliases": [], "isBase": True},
                {"key": "fl_oz_us", "name": "US fluid ounce", "symbol": "fl oz", "aliases": ["ounce"], "isBase": False},
            ],
        }],
    })



def sample_clock():
    return time_utils.current_time_context(
        "America/New_York",
        datetime(2026, 7, 19, 1, 20, 32, tzinfo=timezone.utc),
    )

def test_prompt_contains_tool_rules_and_default_format():
    prompt = build_prompt(sample_catalog(), sample_clock())
    assert "Use LogbookLogPointEvent for an observation" in prompt
    assert "Use LogbookStartDurationEvent when an activity begins" in prompt
    assert "Use LogbookFinishDurationEvent when the user says" in prompt
    assert "Use LogbookGetLatestEvent when the user asks" in prompt
    assert "Use LogbookUpdateLatestEvent when the user corrects" in prompt
    assert "Always provide an exact existing event_type_key" in prompt
    assert "After a tool runs, relay its returned result" in prompt
    assert "{event type} happened at {start time human readable}" in prompt
    assert "Logbook__LogbookGetLatestEvent" in prompt
    assert "Current Home Assistant clock (authoritative)" in prompt
    assert "America/New_York (EDT)" in prompt
    assert "2026-07-18T21:20:32-04:00" in prompt
    assert "2026-07-19T01:20:32.000Z" in prompt
    assert "Never append `Z` to a local wall-clock time" in prompt
    assert "event.measurement.value" in prompt
    assert "Never pair a canonical value with the display unit" in prompt


def test_prompt_contains_exact_catalog_keys_aliases_and_units():
    prompt = build_prompt(sample_catalog(), sample_clock())
    assert "feeding_jay — Feeding Jay" in prompt
    assert "feed Jay, Jay feeding" in prompt
    assert "fl_oz_us" in prompt
    assert "ml" in prompt


def test_manifest_declares_a_single_config_entry_custom_integration():
    manifest = json.loads((COMPONENT / "manifest.json").read_text())
    assert manifest == {
        "domain": "event_logbook",
        "name": "Logbook Events",
        "version": "0.1.8",
        "config_flow": True,
        "single_config_entry": True,
        "integration_type": "service",
        "iot_class": "local_polling",
        "documentation": "https://github.com/formerlyzerocool/logbook#home-assistant-integration",
        "issue_tracker": "https://github.com/formerlyzerocool/logbook/issues",
        "codeowners": ["@formerlyzerocool"],
    }


def test_six_native_tool_names_are_present():
    tree = ast.parse((COMPONENT / "tools.py").read_text())
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "name" and isinstance(node.value, ast.Constant):
                    names.add(str(node.value.value))
    assert names == {
        "LogbookListEventTypes",
        "LogbookLogPointEvent",
        "LogbookStartDurationEvent",
        "LogbookFinishDurationEvent",
        "LogbookGetLatestEvent",
        "LogbookUpdateLatestEvent",
    }


def test_domain_does_not_conflict_with_home_assistant_core_logbook():
    manifest = json.loads((COMPONENT / "manifest.json").read_text())
    assert manifest["domain"] == "event_logbook"
    assert manifest["domain"] != "logbook"


def test_legacy_llm_api_is_registered_for_home_assistant_2026_7():
    init_source = (COMPONENT / "__init__.py").read_text()
    api_source = (COMPONENT / "llm_api.py").read_text()
    assert "llm.async_register_api" in init_source
    assert "class LogbookAPI(llm.API)" in api_source
    assert 'id="event_logbook"' in api_source
    assert 'name="Logbook"' in api_source


def test_logbook_api_registration_is_unconditional():
    init_source = (COMPONENT / "__init__.py").read_text()
    assert "unregister_api = llm.async_register_api" in init_source
    assert 'hasattr(llm_component, "LLMTools")' not in init_source


def test_contributed_tool_platform_is_a_noop_to_prevent_ghost_tools():
    llm_source = (COMPONENT / "llm.py").read_text()
    assert "return None" in llm_source
    assert "build_tools" not in llm_source
    assert "build_prompt" not in llm_source


def test_write_tools_always_send_explicit_utc_timestamps():
    tools_source = (COMPONENT / "tools.py").read_text()
    assert '"occurredAt": _utc_timestamp(hass, args.get("occurred_at"))' in tools_source
    assert '"startedAt": _utc_timestamp(hass, args.get("started_at"))' in tools_source
    assert '"endedAt": _utc_timestamp(hass, args.get("ended_at"))' in tools_source
    assert 'payload["startedAt"] = _utc_timestamp(hass, args.get("started_at"))' in tools_source


def test_llm_api_builds_prompt_with_home_assistant_current_time():
    source = (COMPONENT / "llm_api.py").read_text()
    assert "self.hass.config.time_zone" in source
    assert "dt_util.utcnow()" in source
    assert "current_time_context" in source


def test_tool_results_normalize_default_display_units_for_llm():
    tools_source = (COMPONENT / "tools.py").read_text()
    assert "event_with_default_display_unit" in tools_source
    assert "event.measurement.value" in tools_source
    assert '"defaultUnitSymbol": event_type.default_unit_symbol' in tools_source


def test_prompt_lists_required_and_optional_fields_for_every_tool():
    prompt = build_prompt(sample_catalog(), sample_clock())
    assert "LogbookListEventTypes: no arguments" in prompt
    assert "LogbookLogPointEvent: required `event_type_key`; optional" in prompt
    assert "LogbookStartDurationEvent: required `event_type_key`; optional" in prompt
    assert "LogbookFinishDurationEvent: required `event_type_key`; optional" in prompt
    assert "LogbookGetLatestEvent: required `event_type_key`; no optional fields" in prompt
    assert "LogbookUpdateLatestEvent: required `event_type_key` plus at least one" in prompt
    assert "Never send optional fields as placeholders" in prompt
    assert "`unit_key` is never required" in prompt


def test_individual_tool_descriptions_and_fields_mark_optionality():
    source = (COMPONENT / "tools.py").read_text()
    assert "Required field: event_type_key" in source
    assert "Optional fields: occurred_at, value, unit_key, text_value, note" in source
    assert "Optional fields: started_at, value, unit_key, text_value, note" in source
    assert "Optional fields: ended_at, value, unit_key" in source
    assert "There are no optional " in source and "fields." in source
    assert "Also provide at least one optional correction field" in source
    assert "description=EVENT_TYPE_KEY_DESCRIPTION" in source
    assert "description=OPTIONAL_VALUE_DESCRIPTION" in source
    assert "description=OPTIONAL_UNIT_DESCRIPTION" in source
    assert "description=OPTIONAL_TEXT_DESCRIPTION" in source
    assert "description=OPTIONAL_NOTE_DESCRIPTION" in source
