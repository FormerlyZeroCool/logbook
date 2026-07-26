import type { SerializedSeries, UnitDescriptor } from '../contracts.js';
import { AnalysisRuntimeError, assertFiniteNumber } from '../errors.js';
import { MapFilterResult } from './MapFilterResult.js';
import { NumericPoint } from './NumericPoint.js';
import { NumericWindow } from './NumericWindow.js';
import { ScalarValue } from './ScalarValue.js';

export type SeriesScope = 'visible' | 'all';
export type Mapper = (value: number | null, point: NumericPoint, index: number, options: Record<string, unknown>, context: unknown) => number | null;
export type Predicate = (value: number | null, point: NumericPoint, index: number, options: Record<string, unknown>, context: unknown) => boolean;
export type MapFilterMapper = (value: number | null, point: NumericPoint, index: number, options: Record<string, unknown>, context: unknown) => MapFilterResult;
export type WindowMapper = (window: NumericWindow, options: Record<string, unknown>, context: unknown) => number | null;
export type Reducer = (values: readonly (number | null)[], points: readonly NumericPoint[], options: Record<string, unknown>, context: unknown) => number | string | null | ScalarValue;

function selected(points: readonly NumericPoint[], scope: SeriesScope = 'visible'): NumericPoint[] {
  return scope === 'all' ? [...points] : points.filter((point) => point.inRequestedRange);
}
function aggregate(values: number[], operation: 'sum' | 'mean' | 'median' | 'min' | 'max'): number | null {
  if (values.length === 0) return null;
  if (operation === 'sum') return values.reduce((total, value) => total + value, 0);
  if (operation === 'mean') return values.reduce((total, value) => total + value, 0) / values.length;
  if (operation === 'min') return Math.min(...values);
  if (operation === 'max') return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export class NumericSeries {
  readonly points: readonly NumericPoint[];
  constructor(
    points: readonly NumericPoint[],
    readonly label = 'Series',
    readonly unit: UnitDescriptor | null = null,
    readonly key: string | null = null
  ) {
    this.points = Object.freeze([...points].sort((a, b) => a.timeMs - b.timeMs || String(a.eventId).localeCompare(String(b.eventId))));
    Object.freeze(this);
  }

  map(mapper: Mapper, options: Record<string, unknown> = {}, context?: unknown): NumericSeries {
    return new NumericSeries(this.points.map((point, index) => point.withValue(assertFiniteNumber(mapper(point.value, point, index, options, context), 'map'))), this.label, this.unit, this.key);
  }

  filter(predicate: Predicate, options: Record<string, unknown> = {}, context?: unknown): NumericSeries {
    return new NumericSeries(this.points.filter((point, index) => {
      const result = predicate(point.value, point, index, options, context);
      if (typeof result !== 'boolean') throw new AnalysisRuntimeError('invalid_predicate_result', 'filter must return a boolean');
      return result;
    }), this.label, this.unit, this.key);
  }

  mapFilter(mapper: MapFilterMapper, options: Record<string, unknown> = {}, context?: unknown): NumericSeries {
    const points: NumericPoint[] = [];
    this.points.forEach((point, index) => {
      const result = mapper(point.value, point, index, options, context);
      if (!(result instanceof MapFilterResult)) throw new AnalysisRuntimeError('invalid_map_filter_result', 'mapFilter must return MapFilterResult.keep(...) or MapFilterResult.drop()');
      if (result.keep) points.push(point.withValue(assertFiniteNumber(result.value, 'mapFilter')));
    });
    return new NumericSeries(points, this.label, this.unit, this.key);
  }

  transformWindow(transformer: WindowMapper, windowSize: number, options: { alignment?: 'trailing' | 'centered' | 'leading'; partial?: boolean } & Record<string, unknown> = {}, context?: unknown): NumericSeries {
    if (!Number.isInteger(windowSize) || windowSize < 1) throw new AnalysisRuntimeError('invalid_window_size', 'windowSize must be an integer greater than zero');
    const alignment = options.alignment ?? 'trailing';
    const partial = options.partial ?? false;
    const output = this.points.map((anchorPoint, anchorIndex) => {
      let before = windowSize - 1;
      let after = 0;
      if (alignment === 'leading') { before = 0; after = windowSize - 1; }
      if (alignment === 'centered') { before = Math.floor((windowSize - 1) / 2); after = (windowSize - 1) - before; }
      const requestedStart = anchorIndex - before;
      const requestedEnd = anchorIndex + after + 1;
      const startIndex = Math.max(0, requestedStart);
      const endIndexExclusive = Math.min(this.points.length, requestedEnd);
      const points = this.points.slice(startIndex, endIndexExclusive);
      if (!partial && (requestedStart < 0 || requestedEnd > this.points.length)) return anchorPoint.withValue(null);
      const window = new NumericWindow({ points, anchorPoint, anchorIndex, startIndex, endIndexExclusive, requestedSize: windowSize });
      return anchorPoint.withValue(assertFiniteNumber(transformer(window, options, context), 'transformWindow'));
    });
    return new NumericSeries(output, this.label, this.unit, this.key);
  }

  windowedMap(transformer: WindowMapper, windowSize: number, options: Record<string, unknown> = {}, context?: unknown): NumericSeries {
    return this.transformWindow(transformer, windowSize, options, context);
  }
  windowed_map(transformer: WindowMapper, windowSize: number, options: Record<string, unknown> = {}, context?: unknown): NumericSeries {
    return this.transformWindow(transformer, windowSize, options, context);
  }

  reduce(reducer: Reducer, options: { scope?: SeriesScope } & Record<string, unknown> = {}, context?: unknown): ScalarValue {
    const points = selected(this.points, options.scope);
    const result = reducer(points.map((point) => point.value), points, options, context);
    if (result instanceof ScalarValue) return result;
    if (typeof result !== 'number' && typeof result !== 'string' && result !== null) throw new AnalysisRuntimeError('invalid_reduce_result', 'reduce must return a number, string, null, or ScalarValue');
    if (typeof result === 'number' && !Number.isFinite(result)) throw new AnalysisRuntimeError('invalid_reduce_result', 'reduce returned a non-finite number');
    return new ScalarValue(result, this.label, this.unit);
  }

  filterNulls(): NumericSeries { return this.filter((value) => value !== null); }
  lag(offset = 1): NumericSeries {
    if (!Number.isInteger(offset) || offset < 1) throw new AnalysisRuntimeError('invalid_offset', 'lag offset must be a positive integer');
    return new NumericSeries(this.points.map((point, index) => point.withValue(this.points[index - offset]?.value ?? null)), this.label, this.unit, this.key);
  }
  lead(offset = 1): NumericSeries {
    if (!Number.isInteger(offset) || offset < 1) throw new AnalysisRuntimeError('invalid_offset', 'lead offset must be a positive integer');
    return new NumericSeries(this.points.map((point, index) => point.withValue(this.points[index + offset]?.value ?? null)), this.label, this.unit, this.key);
  }
  difference(offset = 1): NumericSeries {
    const lagged = this.lag(offset);
    return new NumericSeries(this.points.map((point, index) => {
      const previous = lagged.points[index]?.value ?? null;
      return point.withValue(point.value === null || previous === null ? null : point.value - previous);
    }), this.label, this.unit, this.key);
  }
  rollingMean(windowSize: number, options: Record<string, unknown> = {}): NumericSeries {
    return this.transformWindow((window) => aggregate([...window.validValues()], 'mean'), windowSize, options);
  }
  cumulativeSum(options: { scope?: SeriesScope } = {}): NumericSeries {
    let total = 0;
    return new NumericSeries(this.points.map((point) => {
      if ((options.scope === 'all' || point.inRequestedRange) && point.value !== null) total += point.value;
      return point.withValue(total);
    }), this.label, this.unit, this.key);
  }
  bucket(interval: string, aggregation: 'sum' | 'mean' | 'min' | 'max' = 'sum', options: { timeZone?: string } = {}): NumericSeries {
    const unitMatch = /^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/.exec(interval.trim());
    if (!unitMatch) throw new AnalysisRuntimeError('invalid_bucket_interval', `Unsupported bucket interval: ${interval}`);
    const amount = Number(unitMatch[1]);
    const unit = unitMatch[2]!;
    const duration = unit.startsWith('minute') ? amount * 60_000 : unit.startsWith('hour') ? amount * 3_600_000 : unit.startsWith('day') ? amount * 86_400_000 : amount * 7 * 86_400_000;
    const groups = new Map<number, NumericPoint[]>();
    for (const point of this.points) {
      // Day/week timezone alignment is intentionally delegated to the backend query planner in V1.
      void options.timeZone;
      const calendarKey = amount === 1 && unit.startsWith('day') ? point.calendarBucketStarts?.day
        : amount === 1 && unit.startsWith('week') ? point.calendarBucketStarts?.week
        : null;
      const key = calendarKey ? Date.parse(calendarKey) : Math.floor(point.timeMs / duration) * duration;
      const values = groups.get(key) ?? [];
      values.push(point);
      groups.set(key, values);
    }
    const points = [...groups.entries()].sort(([a], [b]) => a - b).map(([timeMs, values]) => {
      const numeric = values.flatMap((point) => point.value === null ? [] : [point.value]);
      const first = values[0]!;
      return new NumericPoint({ ...first.toJSON(), time: new Date(timeMs).toISOString(), timeMs, value: aggregate(numeric, aggregation), inRequestedRange: values.some((point) => point.inRequestedRange) });
    });
    return new NumericSeries(points, this.label, this.unit, this.key);
  }
  divideByAligned(other: NumericSeries): NumericSeries {
    const byEventId = new Map(other.points.filter((point) => point.eventId).map((point) => [point.eventId!, point]));
    const byTime = new Map(other.points.map((point) => [point.timeMs, point]));
    return new NumericSeries(this.points.map((point) => {
      const divisor = (point.eventId ? byEventId.get(point.eventId) : undefined) ?? byTime.get(point.timeMs);
      const value = point.value === null || divisor?.value === null || divisor?.value === undefined || divisor.value <= 0 ? null : point.value / divisor.value;
      return point.withValue(value !== null && Number.isFinite(value) ? value : null);
    }), this.label, this.unit, this.key);
  }

  sum(options: { scope?: SeriesScope } = {}): ScalarValue { return new ScalarValue(aggregate(this.numericValues(options.scope), 'sum'), this.label, this.unit); }
  mean(options: { scope?: SeriesScope } = {}): ScalarValue { return new ScalarValue(aggregate(this.numericValues(options.scope), 'mean'), this.label, this.unit); }
  median(options: { scope?: SeriesScope } = {}): ScalarValue { return new ScalarValue(aggregate(this.numericValues(options.scope), 'median'), this.label, this.unit); }
  min(options: { scope?: SeriesScope } = {}): ScalarValue { return new ScalarValue(aggregate(this.numericValues(options.scope), 'min'), this.label, this.unit); }
  max(options: { scope?: SeriesScope } = {}): ScalarValue { return new ScalarValue(aggregate(this.numericValues(options.scope), 'max'), this.label, this.unit); }
  latest(options: { scope?: SeriesScope } = {}): ScalarValue {
    const point = selected(this.points, options.scope).findLast((candidate) => candidate.value !== null);
    return new ScalarValue(point?.value ?? null, this.label, this.unit);
  }
  withLabel(label: string): NumericSeries { return new NumericSeries(this.points, label, this.unit, this.key); }
  withKey(key: string): NumericSeries { return new NumericSeries(this.points, this.label, this.unit, key); }
  withUnit(unit: UnitDescriptor | null): NumericSeries { return new NumericSeries(this.points, this.label, unit, this.key); }
  visible(): NumericSeries { return new NumericSeries(this.points.filter((point) => point.inRequestedRange), this.label, this.unit, this.key); }
  toJSON(): SerializedSeries { return { kind: 'series', key: this.key, label: this.label, unit: this.unit, points: this.points.filter((point) => point.inRequestedRange).map((point) => point.toJSON()) }; }

  private numericValues(scope: SeriesScope = 'visible'): number[] {
    return selected(this.points, scope).flatMap((point) => point.value === null ? [] : [point.value]);
  }
}
