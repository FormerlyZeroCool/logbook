from __future__ import annotations

import ast
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
prompt_module = _load_module("prompt", "prompt.py")
VoiceCatalog = models.VoiceCatalog
build_prompt = prompt_module.build_prompt


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


def test_prompt_contains_tool_rules_and_default_format():
    prompt = build_prompt(sample_catalog())
    assert "Use LogbookLogPointEvent for an observation" in prompt
    assert "Use LogbookStartDurationEvent when an activity begins" in prompt
    assert "Use LogbookFinishDurationEvent when the user says" in prompt
    assert "Use LogbookGetLatestEvent when the user asks" in prompt
    assert "Use LogbookUpdateLatestEvent when the user corrects" in prompt
    assert "Always provide an exact existing event_type_key" in prompt
    assert "After a tool runs, relay its returned result" in prompt
    assert "{event type} happened at {start time human readable}" in prompt
    assert "Logbook__LogbookGetLatestEvent" in prompt


def test_prompt_contains_exact_catalog_keys_aliases_and_units():
    prompt = build_prompt(sample_catalog())
    assert "feeding_jay — Feeding Jay" in prompt
    assert "feed Jay, Jay feeding" in prompt
    assert "fl_oz_us" in prompt
    assert "ml" in prompt


def test_manifest_declares_a_single_config_entry_custom_integration():
    manifest = json.loads((COMPONENT / "manifest.json").read_text())
    assert manifest == {
        "domain": "event_logbook",
        "name": "Logbook Events",
        "version": "0.1.3",
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


def test_future_contributed_tool_platform_is_kept_without_duplicate_registration():
    init_source = (COMPONENT / "__init__.py").read_text()
    assert 'hasattr(llm_component, "LLMTools")' in init_source
    assert (COMPONENT / "llm.py").is_file()
