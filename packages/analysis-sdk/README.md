# @logbook/analysis-sdk

Shared immutable class SDK, TypeScript authoring contract, pipeline model, and guest-runtime bootstrap for Logbook analysis programs.

## Point-oriented mapping

Use `mapPoints` when the callback should receive and return a complete immutable `NumericPoint`:

```ts
return event.values().mapPoints((point) =>
  point.withValue((point.value ?? 0) * 2),
);
```

Returning a plain object, `undefined`, `NaN`, or an infinite value is rejected. `point.withValue(...)` preserves timestamps, event IDs, notes, text values, and requested-range metadata.

## Reusable functions

Published and session functions are exposed through a frozen typed namespace using their stable function keys:

```ts
return event.values().map((value, point, index, options, context) =>
  udf.normalize(value, point, index, options, context),
);
```

Keys that are not JavaScript identifiers remain available with bracket notation, such as `udf["normalize-feeding"](...)`. Collision-safe generated aliases remain available for compatibility with previously saved programs.
