from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT.parent / "custom_components" / "event_logbook"
PACKAGE_NAME = "logbook_unit_testpkg"


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
unit_utils = _load_module("unit_utils", "unit_utils.py")


def feeding_event_type():
    return models.CatalogEventType.from_dict({
        "key": "feeding_jay",
        "name": "Feeding Jay",
        "unitType": {"key": "volume", "name": "Volume"},
        "defaultUnit": {"key": "fl_oz_us", "symbol": "fl oz"},
        "units": [
            {"key": "ml", "name": "Milliliter", "symbol": "mL", "isBase": True},
            {"key": "fl_oz_us", "name": "US fluid ounce", "symbol": "fl oz", "isBase": False},
        ],
    })


def test_backend_display_value_becomes_primary_llm_measurement():
    result = unit_utils.event_with_default_display_unit({
        "value": 118.29411825,
        "canonicalValue": 118.29411825,
        "displayValue": 4.0,
        "unit": "fl oz",
        "defaultUnit": {
            "key": "fl_oz_us",
            "symbol": "fl oz",
            "scaleToBase": 29.5735295625,
            "offsetToBase": 0,
        },
        "canonicalUnit": {"key": "ml", "symbol": "mL"},
    }, feeding_event_type())

    assert result["value"] == 4.0
    assert result["unitKey"] == "fl_oz_us"
    assert result["unit"] == "fl oz"
    assert result["measurement"] == {
        "value": 4.0,
        "unitKey": "fl_oz_us",
        "unit": "fl oz",
    }
    assert result["canonicalValue"] == 118.29411825
    assert result["canonicalMeasurement"] == {
        "value": 118.29411825,
        "unitKey": "ml",
        "unit": "mL",
    }


def test_older_backend_can_be_converted_from_default_unit_metadata():
    result = unit_utils.event_with_default_display_unit({
        "value": 118.29411825,
        "canonicalValue": 118.29411825,
        "defaultUnit": {
            "key": "fl_oz_us",
            "symbol": "fl oz",
            "scaleToBase": 29.5735295625,
            "offsetToBase": 0,
        },
        "canonicalUnit": {"key": "ml", "symbol": "mL"},
    }, feeding_event_type())

    assert abs(result["measurement"]["value"] - 4.0) < 1e-9
    assert result["value"] == result["measurement"]["value"]


def test_unitless_numeric_event_keeps_its_value():
    event_type = models.CatalogEventType.from_dict({
        "key": "mood_score",
        "name": "Mood score",
        "unitType": None,
        "defaultUnit": None,
        "units": [],
    })
    result = unit_utils.event_with_default_display_unit({
        "value": 8,
        "canonicalValue": 8,
        "displayValue": 8,
        "defaultUnit": None,
        "canonicalUnit": None,
    }, event_type)

    assert result["measurement"] == {"value": 8, "unitKey": None, "unit": None}
    assert result["value"] == 8
