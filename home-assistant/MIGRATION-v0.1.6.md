# Migration to Logbook Events v0.1.6

Version 0.1.6 fixes numeric values returned to voice assistants.

The backend correctly stores all measurements in a canonical base unit. Its event JSON contains both the canonical value and a `displayValue` converted to the event type's default unit. Earlier integration versions returned the backend object unchanged, so an LLM could pair the canonical `value` with the default-unit symbol—for example, milliliters labeled as fluid ounces.

The integration now makes the converted default-unit measurement explicit and primary:

```json
{
  "measurement": {
    "value": 4,
    "unitKey": "fl_oz_us",
    "unit": "fl oz"
  },
  "value": 4,
  "canonicalValue": 118.294,
  "canonicalMeasurement": {
    "value": 118.294,
    "unitKey": "ml",
    "unit": "mL"
  }
}
```

No backend, database, or frontend migration is required.
