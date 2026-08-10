import type { AnalysisFunctionKind } from '../contracts.js';
import { analysisFunctionCollection, analysisFunctionPropertyIdentifier, functionBindingDeclaration } from './source-documents.js';

export const ANALYSIS_SDK_DECLARATIONS = `
type AnalysisResult = number | string | null | ScalarValue | NumericSeries | SeriesSet;
/** @deprecated UDF configuration belongs in typed factory parameters. Retained only for legacy saved revisions. */
type AnalysisOptions = Readonly<Record<string, any>>;
type WindowTransformOptions = Readonly<{ alignment?: WindowAlignment; partial?: boolean }>;
type ReduceOptions = Readonly<{ scope?: SeriesScope }>;
type SeriesScope = 'visible' | 'all';
type DurationUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours';
type WindowAlignment = 'trailing' | 'centered' | 'leading';
type NumericValueMapper = (value: number, point: NumericPoint, index: number, context: AnalysisContext) => number | null;
type NumericMapper = (value: number | null, point: NumericPoint, index: number, context: AnalysisContext) => NumericPoint;
type NumericPointMapper = NumericMapper;
type NumericPointOnlyMapper = (point: NumericPoint, index: number, context: AnalysisContext) => NumericPoint;
type NumericPredicate = (value: number | null, point: NumericPoint, index: number, context: AnalysisContext) => boolean;
type EventPredicate = (event: EventRecord, index: number, context: AnalysisContext) => boolean;
type NumericMapFilter = (value: number | null, point: NumericPoint, index: number, context: AnalysisContext) => NumericPoint | null | MapFilterResult;
type WindowTransformer = (window: NumericWindow, windowSize: number, context: AnalysisContext) => NumericPoint;
type SeriesReducer = (values: readonly (number | null)[], points: readonly NumericPoint[], context: AnalysisContext) => number | string | null;
type SeriesTransformer = (series: NumericSeries, context: AnalysisContext) => AnalysisResult;

declare class UnitDescriptor {
  constructor(key: string, symbol: string, dimensionKey: string);
  readonly key: string;
  readonly symbol: string;
  readonly dimensionKey: string;
}

declare class EventRecord {
  readonly id: string;
  readonly startedAt: string;
  readonly startedAtMs: number;
  readonly endedAt: string | null;
  readonly endedAtMs: number | null;
  readonly value: number | null;
  readonly textValue: string | null;
  readonly note: string | null;
  readonly ongoing: boolean;
  readonly durationMs: number | null;
  readonly unit: UnitDescriptor | null;
  readonly inRequestedRange: boolean;
  readonly calendarBucketStarts: { readonly day: string; readonly week: string } | null;
}

/** Immutable event input selected in Explore. Derived series retain event metadata and requested-range context. */
declare class EventSeries {
  readonly key: string;
  readonly label: string;
  readonly events: readonly EventRecord[];
  readonly unit: UnitDescriptor | null;
  /** Numeric event values in the selected display unit. */
  values(): NumericSeries;
  value(): NumericSeries;
  starts(): NumericSeries;
  ends(): NumericSeries;
  /** Elapsed event duration. Ongoing events use the response context timestamp. */
  durations(unit?: DurationUnit, options?: AnalysisOptions): NumericSeries;
  timeBetweenStarts(unit?: DurationUnit, options?: AnalysisOptions): NumericSeries;
  /** Forward start-to-start interval attached to the earlier event. */
  timeUntilNextStart(unit?: DurationUnit, options?: AnalysisOptions): NumericSeries;
  filter(predicate: EventPredicate, context?: AnalysisContext): EventSeries;
  /** @deprecated Legacy options-bag callback support. New configurable UDFs should return EventPredicate from a typed factory. */
  filter(predicate: (event: EventRecord, index: number, options: AnalysisOptions, context: AnalysisContext) => boolean, options?: AnalysisOptions, context?: AnalysisContext): EventSeries;
  first(options?: { scope?: SeriesScope }): EventRecord | null;
  latest(options?: { scope?: SeriesScope }): EventRecord | null;
  count(options?: { scope?: SeriesScope }): ScalarValue;
}

declare class NumericPoint {
  readonly time: string;
  readonly timeMs: number;
  readonly value: number | null;
  readonly eventId: string | null;
  readonly note: string | null;
  readonly textValue: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly inRequestedRange: boolean;
  readonly calendarBucketStarts: { readonly day: string; readonly week: string } | null;
  withValue(value: number | null): NumericPoint;
}

declare class NumericWindow {
  readonly values: readonly (number | null)[];
  readonly points: readonly NumericPoint[];
  readonly anchorPoint: NumericPoint;
  readonly anchorIndex: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly requestedSize: number;
  readonly actualSize: number;
  readonly complete: boolean;
  validValues(): readonly number[];
  first(): NumericPoint | null;
  latest(): NumericPoint | null;
}

/** @deprecated Return a NumericPoint to keep the row or null to drop it. */
declare class MapFilterResult {
  readonly keep: boolean;
  readonly value: number | null;
  static keep(value: number | null): MapFilterResult;
  static drop(): MapFilterResult;
}

/** Immutable timestamped numeric series. Operations preserve source metadata unless explicitly filtering rows. */
declare class NumericSeries {
  readonly key: string | null;
  readonly label: string;
  readonly points: readonly NumericPoint[];
  readonly unit: UnitDescriptor | null;
  /** Map every row to a complete immutable point, preserving all returned point metadata. */
  map(mapper: NumericMapper, context?: AnalysisContext): NumericSeries;
  /** Scalar shorthand. Null rows remain null and every numeric result is applied with point.withValue(...). */
  mapValues(mapper: NumericValueMapper, context?: AnalysisContext): NumericSeries;
  /** Point-first convenience form for inline callbacks. Saved udf.mappers callbacks are value-first and should be passed to map(). */
  mapPoints(mapper: NumericPointOnlyMapper, context?: AnalysisContext): NumericSeries;
  /** Keep a point only when the predicate returns true. Numeric zero is never treated as false automatically. */
  filter(predicate: NumericPredicate, context?: AnalysisContext): NumericSeries;
  /** @deprecated Legacy options-bag callback support. */
  filter(predicate: (value: number | null, point: NumericPoint, index: number, options: AnalysisOptions, context: AnalysisContext) => boolean, options?: AnalysisOptions, context?: AnalysisContext): NumericSeries;
  /** Transform and keep a returned NumericPoint, or drop the row by returning null. */
  mapFilter(mapper: NumericMapFilter, context?: AnalysisContext): NumericSeries;
  /** @deprecated Legacy options-bag callback support. */
  mapFilter(mapper: (value: number | null, point: NumericPoint, index: number, options: AnalysisOptions, context: AnalysisContext) => NumericPoint | null | MapFilterResult, options?: AnalysisOptions, context?: AnalysisContext): NumericSeries;
  /** Apply a trailing, centered, or leading window while preserving the anchor point timestamp and metadata. */
  transformWindow(transformer: WindowTransformer, windowSize: number, options?: WindowTransformOptions, context?: AnalysisContext): NumericSeries;
  windowedMap(transformer: WindowTransformer, windowSize: number, options?: WindowTransformOptions, context?: AnalysisContext): NumericSeries;
  windowed_map(transformer: WindowTransformer, windowSize: number, options?: WindowTransformOptions, context?: AnalysisContext): NumericSeries;
  /** Collapse the visible range to a displayed scalar. Reducers may return a finite number, string, or null. Set scope to all only when context rows should participate. */
  reduce(reducer: SeriesReducer, options?: ReduceOptions, context?: AnalysisContext): ScalarValue;
  filterNulls(): NumericSeries;
  lag(offset?: number): NumericSeries;
  lead(offset?: number): NumericSeries;
  difference(offset?: number): NumericSeries;
  rollingMean(windowSize: number, options?: WindowTransformOptions): NumericSeries;
  cumulativeSum(options?: { scope?: SeriesScope }): NumericSeries;
  /** Group points into fixed or calendar-aligned buckets. Supported examples include 15 minutes, 1 hour, 1 day, and 1 week. */
  bucket(interval: string, aggregation?: 'sum' | 'mean' | 'min' | 'max', options?: { timeZone?: string }): NumericSeries;
  divideByAligned(other: NumericSeries): NumericSeries;
  sum(options?: { scope?: SeriesScope }): ScalarValue;
  mean(options?: { scope?: SeriesScope }): ScalarValue;
  median(options?: { scope?: SeriesScope }): ScalarValue;
  min(options?: { scope?: SeriesScope }): ScalarValue;
  max(options?: { scope?: SeriesScope }): ScalarValue;
  latest(options?: { scope?: SeriesScope }): ScalarValue;
  withLabel(label: string): NumericSeries;
  withKey(key: string): NumericSeries;
  withUnit(unit: UnitDescriptor | null): NumericSeries;
  visible(): NumericSeries;
}

declare class ScalarValue {
  readonly value: number | string | null;
  readonly label: string | null;
  readonly unit: UnitDescriptor | null;
  readonly description: string | null;
  constructor(value: number | string | null, label?: string | null, unit?: UnitDescriptor | null, description?: string | null);
  withLabel(label: string): ScalarValue;
  withUnit(unit: UnitDescriptor | null): ScalarValue;
  withDescription(description: string): ScalarValue;
}

/** Multiple numeric series rendered together. */
declare class SeriesSet {
  readonly title: string | null;
  readonly series: readonly NumericSeries[];
  static of(...series: NumericSeries[]): SeriesSet;
  withTitle(title: string): SeriesSet;
}

/** Stable execution context captured with the normalized query response. */
declare class AnalysisContext {
  readonly from: string;
  readonly to: string;
  readonly now: string;
  readonly fromMs: number;
  readonly toMs: number;
  readonly nowMs: number;
  readonly timeZone: string;
}

declare const console: Readonly<{
  log(...values: readonly unknown[]): void;
  warn(...values: readonly unknown[]): void;
  error(...values: readonly unknown[]): void;
}>;

/** Sandboxed analysis code has no browser, network, Node.js, or Home Assistant globals. */
declare const window: never;
declare const document: never;
declare const fetch: never;
declare const XMLHttpRequest: never;
declare const WebSocket: never;
declare const process: never;
declare const require: never;
`;

export function generateFunctionBindingDeclarations(bindings: readonly { alias: string; functionKind: AnalysisFunctionKind; functionKey?: string; sourceBody?: string }[]): string {
  const legacyDeclarations = bindings.map((binding) => functionBindingDeclaration(binding.functionKind, binding.alias, binding.sourceBody));
  const groups = {
    mappers: [] as string[],
    filters: [] as string[],
    reducers: [] as string[],
    window_transforms: [] as string[],
    map_filters: [] as string[],
    series_transforms: [] as string[],
  };
  for (const binding of bindings) {
    const functionKey = binding.functionKey ?? binding.alias;
    const propertyKey = analysisFunctionPropertyIdentifier(functionKey);
    const collection = analysisFunctionCollection(binding.functionKind);
    groups[collection].push(
      `    /** Saved ${binding.functionKind}: ${functionKey} */`,
      `    readonly ${propertyKey}: typeof ${binding.alias};`,
    );
  }
  const collectionDeclaration = (name: keyof typeof groups): string => {
    const entries = groups[name];
    return entries.length
      ? `  readonly ${name}: Readonly<{\n${entries.join('\n')}\n  }>;`
      : `  readonly ${name}: Readonly<Record<never, never>>;`;
  };
  return [
    ...legacyDeclarations,
    'declare const udf: Readonly<{',
    collectionDeclaration('mappers'),
    collectionDeclaration('filters'),
    collectionDeclaration('reducers'),
    collectionDeclaration('window_transforms'),
    collectionDeclaration('map_filters'),
    collectionDeclaration('series_transforms'),
    '}>;',
  ].join('\n');
}
