# @logbook/analysis-sdk

Shared immutable class SDK, TypeScript authoring contract, pipeline model, and guest-runtime bootstrap for Logbook analysis programs.

## Point-oriented mapping

`NumericSeries.map` is point-preserving by contract. A mapper receives the
current value and complete immutable point, then returns a `NumericPoint`:

```ts
return event.values().map((value, point) =>
  point.withValue((value ?? 0) * 1000),
);
```

Saved mapper functions use the same contract and can be passed directly:

```ts
return event.values().map(udf.mappers.double_value);
```

Returning the complete point preserves its timestamp, event ID, note, text
value, requested-range state, calendar bucket information, and future metadata.
Use `point.withValue(...)` when only the numeric value changes.

For short scalar arithmetic, `mapValues` is available. It always applies the
returned value through the original point's `withValue` method and leaves null
rows unchanged:

```ts
return event.values().mapValues((value) => value * 1000);
```

A mapper that returns a number, plain object, `undefined`, `NaN`, or infinity is
rejected by `map`; reusable mapper UDFs must return `NumericPoint`.

## Reusable functions

Every saved or session function appears under one frozen typed `udf` object:

```ts
udf.mappers.scale
udf.filters.positive_only
udf.reducers.mean
udf.window_transforms.trailing_mean
```

Advanced function kinds remain available under `udf.map_filters` and `udf.series_transforms`.

### Reducers and displayed scalar results

Reducer callbacks may return a finite number, a string, or `null`:

```ts
return event.values().reduce((values) =>
  values.some((value) => value !== null) ? 'has values' : 'empty',
);
```

`reduce` wraps the result in `ScalarValue`, which the Explore Plot section renders as a prominent scalar. Numeric reducer results retain the series unit; string results do not carry a numeric unit. Raw top-level numbers, strings, and `null` are also normalized to scalar output.

Function keys use lowercase letters, numbers, and underscores. Hyphens are not accepted for new keys and legacy hyphenated keys are normalized to underscores by the database migration.


### Map/filter functions

A map/filter uses the scalar point callback parameters and returns either a complete point or `null`:

```ts
function keep_positive(
  value: number | null,
  point: NumericPoint,
  index: number,
  options: AnalysisOptions,
  context: AnalysisContext,
): NumericPoint | null {
  return value !== null && value > 0
    ? point.withValue(value * 2)
    : null;
}
```

Use it through `mapFilter`:

```ts
return event.values().mapFilter(udf.map_filters.keep_positive);
```

Returning `null` drops the row. Returning a `NumericPoint` keeps the returned timestamp and metadata. Legacy `MapFilterResult` revisions remain executable for backward compatibility, but new templates use `NumericPoint | null`.

## Signature inference

Reusable-function revisions persist the complete function declaration. Template buttons only provide starting signatures; the saved category is inferred from the actual parameter and return types.

Window transforms use a distinct point-returning contract:

```ts
function trailing_mean(
  window: NumericWindow,
  windowSize: number,
  options: AnalysisOptions,
  context: AnalysisContext,
): NumericPoint {
  const values = window.validValues();
  const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
  return window.anchorPoint.withValue(value);
}
```

The `windowSize` parameter is the requested size passed to `transformWindow`, while `window.actualSize` reports the number of points available for the current window.
