# @logbook/analysis-sdk

Shared immutable class SDK, TypeScript authoring contract, pipeline model, and guest-runtime bootstrap for Logbook analysis programs.

## Point-preserving mapping

`NumericSeries.map` accepts a mapper that returns a complete `NumericPoint`:

```ts
return event.values().map((value, point) =>
  point.withValue((value ?? 0) * 1000),
);
```

Returning the point preserves its timestamp, event ID, note, text value,
requested-range state, calendar metadata, and future metadata fields. Use
`mapValues` only for short scalar arithmetic where null points should remain
null automatically:

```ts
return event.values().mapValues((value) => value * 1000);
```

## Reusable functions

Every saved or session function appears under one frozen typed `udf` object:

```ts
udf.mappers.identity
udf.filters.positive_only
udf.reducers.mean
udf.window_transforms.trailing_mean
udf.map_filters.normalize_and_drop_invalid
udf.series_transforms.label_series
```

Function keys use lowercase letters, numbers, and underscores. Hyphens and `$`
aliases are not part of the public UDF API.

### Typed configurable UDFs

Configuration is expressed by normal TypeScript parameters. A configurable UDF
is a factory that returns its category's callback type:

```ts
function clamp(min: number, max: number): NumericMapper {
  if (min > max) throw new Error('min must be less than or equal to max');

  return (value, point): NumericPoint =>
    value === null
      ? point
      : point.withValue(Math.min(max, Math.max(min, value)));
}
```

It remains in `udf.mappers` and is self-documenting at the call site:

```ts
return event.values().map(udf.mappers.clamp(0, 100));
```

More complex configuration can use an inline named object type:

```ts
function normalize(config: {
  input_min: number;
  input_max: number;
  output_min?: number;
  output_max?: number;
}): NumericMapper {
  const outputMin = config.output_min ?? 0;
  const outputMax = config.output_max ?? 1;

  return (value, point) => {
    if (value === null) return point;
    const ratio = (value - config.input_min) / (config.input_max - config.input_min);
    return point.withValue(outputMin + ratio * (outputMax - outputMin));
  };
}
```

```ts
return event.values().map(
  udf.mappers.normalize({
    input_min: 0,
    input_max: 500,
    output_min: -1,
    output_max: 1,
  }),
);
```

Inline primitive, literal, array, tuple, union, and object-literal parameter
types are supported. Named user-defined configuration types are intentionally
deferred until the function library has declaration dependency tracking and
versioning.

The callback aliases used for category inference are:

```ts
NumericMapper       // NumericPoint
NumericPredicate    // boolean
EventPredicate      // boolean
NumericMapFilter    // NumericPoint | null
WindowTransformer   // NumericPoint
SeriesReducer       // number | string | null
SeriesTransformer   // AnalysisResult
```

A direct no-configuration callback remains valid. Existing saved callbacks that
receive `AnalysisOptions` remain executable for compatibility, but new templates
and built-in configurable functions use typed factory parameters.

## Map/filter functions

A map/filter returns a complete point to keep it or `null` to remove it:

```ts
function keep_positive(
  value: number | null,
  point: NumericPoint,
  index: number,
  context: AnalysisContext,
): NumericPoint | null {
  return value !== null && value > 0
    ? point.withValue(value * 2)
    : null;
}
```

```ts
return event.values().mapFilter(udf.map_filters.keep_positive);
```

## Window transforms

Window transforms receive the requested window size and return a point anchored
to the appropriate input row:

```ts
function trailing_mean(
  window: NumericWindow,
  windowSize: number,
  context: AnalysisContext,
): NumericPoint {
  const values = window.validValues();
  const value = values.length
    ? values.reduce((sum, item) => sum + item, 0) / values.length
    : null;
  return window.anchorPoint.withValue(value);
}
```

## Reducers and scalar output

Reducers may return a finite number, string, or `null`:

```ts
return event.values().reduce((values) =>
  values.some((value) => value !== null) ? 'has values' : 'empty',
);
```

The Explore Plot section renders the result as a scalar. Numeric results retain
the series unit; string results do not carry a numeric unit.
