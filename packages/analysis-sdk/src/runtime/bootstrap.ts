// The guest bundle is deliberately self-contained. It is evaluated inside every
// fresh QuickJS context and creates/freeze the same public SDK surface used by
// the host TypeScript implementation.
function guestBootstrap(): void {
  const finite = (value: unknown, operation: string): number | null => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${operation} must return a finite number or null`);
    return value;
  };
  class UnitDescriptor {
    constructor(readonly key: string, readonly symbol: string, readonly dimensionKey: string) { Object.freeze(this); }
  }
  class MapFilterResult {
    constructor(readonly keep: boolean, readonly value: number | null) { Object.freeze(this); }
    static keep(value: number | null) { return new MapFilterResult(true, value); }
    static drop() { return new MapFilterResult(false, null); }
  }
  class NumericPoint {
    constructor(input: any) { Object.assign(this, input); Object.freeze(this); }
    withValue(value: number | null) { return new NumericPoint({ ...this, value }); }
  }
  class NumericWindow {
    values: readonly (number | null)[];
    actualSize: number;
    complete: boolean;
    constructor(input: any) {
      Object.assign(this, input);
      this.values = Object.freeze(input.points.map((point: any) => point.value));
      this.actualSize = input.points.length;
      this.complete = input.points.length === input.requestedSize;
      Object.freeze(this);
    }
    validValues() { return this.values.filter((value): value is number => value !== null && Number.isFinite(value)); }
    first() { return (this as any).points[0] ?? null; }
    latest() { return (this as any).points.at(-1) ?? null; }
  }
  class ScalarValue {
    constructor(readonly value: number | string | null, readonly label: string | null = null, readonly unit: any = null, readonly description: string | null = null) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Scalar value must be finite');
      Object.freeze(this);
    }
    withLabel(label: string) { return new ScalarValue(this.value, label, this.unit, this.description); }
    withUnit(unit: any) { return new ScalarValue(this.value, this.label, unit, this.description); }
    withDescription(description: string) { return new ScalarValue(this.value, this.label, this.unit, description); }
  }
  class NumericSeries {
    points: readonly any[];
    constructor(points: readonly any[], readonly label = 'Series', readonly unit: any = null, readonly key: string | null = null) {
      this.points = Object.freeze([...points].sort((a, b) => a.timeMs - b.timeMs || String(a.eventId).localeCompare(String(b.eventId))));
      Object.freeze(this);
    }
    map(mapper: any, options: any = {}, context?: any) { return new NumericSeries(this.points.map((point, index) => point.value === null ? point : point.withValue(finite(mapper(point.value, point, index, options, context), 'map'))), this.label, this.unit, this.key); }
    mapPoints(mapper: any, options: any = {}, context?: any) { return new NumericSeries(this.points.map((point, index) => { const mapped = mapper(point, index, options, context); if (!(mapped instanceof NumericPoint)) throw new Error('mapPoints must return a NumericPoint, usually point.withValue(...)'); finite((mapped as any).value, 'mapPoints'); return mapped; }), this.label, this.unit, this.key); }
    filter(predicate: any, options: any = {}, context?: any) { return new NumericSeries(this.points.filter((point, index) => { const keep = predicate(point.value, point, index, options, context); if (typeof keep !== 'boolean') throw new Error('filter must return boolean'); return keep; }), this.label, this.unit, this.key); }
    mapFilter(mapper: any, options: any = {}, context?: any) { const output: any[] = []; this.points.forEach((point, index) => { const result = mapper(point.value, point, index, options, context); if (!(result instanceof MapFilterResult)) throw new Error('mapFilter must return MapFilterResult'); if (result.keep) output.push(point.withValue(finite(result.value, 'mapFilter'))); }); return new NumericSeries(output, this.label, this.unit, this.key); }
    transformWindow(transformer: any, windowSize: number, options: any = {}, context?: any) {
      if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error('windowSize must be a positive integer');
      const alignment = options.alignment ?? 'trailing'; const partial = options.partial ?? false;
      const output = this.points.map((anchorPoint, anchorIndex) => {
        let before = windowSize - 1; let after = 0;
        if (alignment === 'leading') { before = 0; after = windowSize - 1; }
        if (alignment === 'centered') { before = Math.floor((windowSize - 1) / 2); after = windowSize - 1 - before; }
        const requestedStart = anchorIndex - before; const requestedEnd = anchorIndex + after + 1;
        const startIndex = Math.max(0, requestedStart); const endIndexExclusive = Math.min(this.points.length, requestedEnd);
        const points = this.points.slice(startIndex, endIndexExclusive);
        if (!partial && (requestedStart < 0 || requestedEnd > this.points.length)) return anchorPoint.withValue(null);
        const window = new NumericWindow({ points, anchorPoint, anchorIndex, startIndex, endIndexExclusive, requestedSize: windowSize });
        return anchorPoint.withValue(finite(transformer(window, options, context), 'transformWindow'));
      });
      return new NumericSeries(output, this.label, this.unit, this.key);
    }
    windowedMap(transformer: any, windowSize: number, options: any = {}, context?: any) { return this.transformWindow(transformer, windowSize, options, context); }
    windowed_map(transformer: any, windowSize: number, options: any = {}, context?: any) { return this.transformWindow(transformer, windowSize, options, context); }
    reduce(reducer: any, options: any = {}, context?: any) { const points = options.scope === 'all' ? [...this.points] : this.points.filter((point) => point.inRequestedRange); const result = reducer(points.map((point) => point.value), points, options, context); return result instanceof ScalarValue ? result : new ScalarValue(result, this.label, this.unit); }
    filterNulls() { return this.filter((value: any) => value !== null); }
    lag(offset = 1) { return new NumericSeries(this.points.map((point, index) => point.withValue(this.points[index - offset]?.value ?? null)), this.label, this.unit, this.key); }
    lead(offset = 1) { return new NumericSeries(this.points.map((point, index) => point.withValue(this.points[index + offset]?.value ?? null)), this.label, this.unit, this.key); }
    difference(offset = 1) { const lag = this.lag(offset); return new NumericSeries(this.points.map((point, index) => point.withValue(point.value === null || lag.points[index]?.value == null ? null : point.value - lag.points[index].value)), this.label, this.unit, this.key); }
    rollingMean(size: number, options: any = {}) { return this.transformWindow((window: any) => { const values = window.validValues(); return values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null; }, size, options); }
    cumulativeSum(options: any = {}) { let total = 0; return new NumericSeries(this.points.map((point) => { if ((options.scope === 'all' || point.inRequestedRange) && point.value !== null) total += point.value; return point.withValue(total); }), this.label, this.unit, this.key); }
    bucket(interval: string, aggregation: string = 'sum', options: any = {}) {
      const match = /^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/.exec(String(interval).trim());
      if (!match) throw new Error('Unsupported bucket interval: ' + interval);
      const amount = Number(match[1]); const unit = match[2]!;
      const duration = unit.startsWith('minute') ? amount * 60000 : unit.startsWith('hour') ? amount * 3600000 : unit.startsWith('day') ? amount * 86400000 : amount * 7 * 86400000;
      void options.timeZone;
      const groups = new Map();
      for (const point of this.points) { const calendarKey = amount === 1 && unit.startsWith('day') ? point.calendarBucketStarts?.day : amount === 1 && unit.startsWith('week') ? point.calendarBucketStarts?.week : null; const key = calendarKey ? Date.parse(calendarKey) : Math.floor(point.timeMs / duration) * duration; const group = groups.get(key) ?? []; group.push(point); groups.set(key, group); }
      const aggregate = (values: number[]) => { if (!values.length) return null; if (aggregation === 'sum') return values.reduce((a,b)=>a+b,0); if (aggregation === 'mean') return values.reduce((a,b)=>a+b,0)/values.length; if (aggregation === 'min') return Math.min(...values); if (aggregation === 'max') return Math.max(...values); throw new Error('Unsupported bucket aggregation: ' + aggregation); };
      return new NumericSeries([...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([timeMs, points]: any) => { const first = points[0]; return new NumericPoint({ ...first, time: new Date(timeMs).toISOString(), timeMs, value: aggregate(points.flatMap((point: any) => point.value === null ? [] : [point.value])), inRequestedRange: points.some((point: any) => point.inRequestedRange) }); }), this.label, this.unit, this.key);
    }
    divideByAligned(other: any) { const byId = new Map(other.points.filter((point: any) => point.eventId).map((point: any) => [point.eventId, point])); const byTime = new Map(other.points.map((point: any) => [point.timeMs, point])); return new NumericSeries(this.points.map((point) => { const divisor: any = (point.eventId ? byId.get(point.eventId) : null) ?? byTime.get(point.timeMs); return point.withValue(point.value === null || !divisor || divisor.value === null || divisor.value <= 0 ? null : point.value / divisor.value); }), this.label, this.unit, this.key); }
    withLabel(label: string) { return new NumericSeries(this.points, label, this.unit, this.key); }
    withKey(key: string) { return new NumericSeries(this.points, this.label, this.unit, key); }
    withUnit(unit: any) { return new NumericSeries(this.points, this.label, unit, this.key); }
    visible() { return new NumericSeries(this.points.filter((point) => point.inRequestedRange), this.label, this.unit, this.key); }
    sum(options: any = {}) { return this.reduce((values: any[]) => { const valid = values.filter((v) => v !== null); return valid.length ? valid.reduce((a, b) => a + b, 0) : null; }, options); }
    mean(options: any = {}) { return this.reduce((values: any[]) => { const valid = values.filter((v) => v !== null); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }, options); }
    median(options: any = {}) { return this.reduce((values: any[]) => { const valid = values.filter((v) => v !== null).sort((a,b)=>a-b); if (!valid.length) return null; const middle=Math.floor(valid.length/2); return valid.length%2 ? valid[middle] : (valid[middle-1]+valid[middle])/2; }, options); }
    min(options: any = {}) { return this.reduce((values: any[]) => { const valid=values.filter((v)=>v!==null); return valid.length ? Math.min(...valid) : null; }, options); }
    max(options: any = {}) { return this.reduce((values: any[]) => { const valid=values.filter((v)=>v!==null); return valid.length ? Math.max(...valid) : null; }, options); }
    latest(options: any = {}) { return this.reduce((_values: any[], points: any[]) => points.findLast((point) => point.value !== null)?.value ?? null, options); }
  }
  class EventRecord { constructor(input: any, unit: any, nowMs: number) { Object.assign(this, input, { value: input.displayValue, unit, startedAtMs: Date.parse(input.startedAt), endedAtMs: input.endedAt ? Date.parse(input.endedAt) : null }); (this as any).durationMs = Math.max(0, ((this as any).endedAtMs ?? nowMs) - (this as any).startedAtMs); Object.freeze(this); } }
  class EventSeries {
    events: readonly any[];
    key!: string;
    label!: string;
    unit: any;
    nowMs!: number;
    constructor(input: any, nowMs: number) { Object.assign(this, { key: input.key, label: input.label, unit: input.unit, nowMs }); this.events = Object.freeze(input.events.map((event: any) => new EventRecord(event, input.unit, nowMs)).sort((a: any, b: any) => a.startedAtMs - b.startedAtMs || a.id.localeCompare(b.id))); Object.freeze(this); }
    build(mapper: any, label: string, unit: any) { return new NumericSeries(this.events.map((event: any, index: number) => new NumericPoint({ time: event.startedAt, timeMs: event.startedAtMs, value: mapper(event, index), eventId: event.id, note: event.note, textValue: event.textValue, startedAt: event.startedAt, endedAt: event.endedAt, inRequestedRange: event.inRequestedRange, calendarBucketStarts: event.calendarBucketStarts })), label, unit); }
    values() { return this.build((event: any) => event.value, this.label, (this as any).unit); }
    value() { return this.values(); }
    starts() { return this.build((event: any) => event.startedAtMs, `${(this as any).label} starts`, null); }
    ends() { return this.build((event: any) => event.endedAtMs, `${(this as any).label} ends`, null); }
    durations(unit = 'seconds') { const scale = unit === 'milliseconds' ? 1 : unit === 'seconds' ? 1000 : unit === 'minutes' ? 60000 : 3600000; return this.build((event: any) => event.durationMs === null ? null : event.durationMs / scale, `${(this as any).label} duration`, { key: unit, symbol: unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : unit === 'seconds' ? 's' : 'ms', dimensionKey: 'time' }); }
    timeBetweenStarts(unit = 'minutes') { const scale = unit === 'milliseconds' ? 1 : unit === 'seconds' ? 1000 : unit === 'minutes' ? 60000 : 3600000; return this.build((event: any, index: number) => index ? (event.startedAtMs - this.events[index - 1].startedAtMs) / scale : null, 'Time between starts', { key: unit, symbol: unit === 'minutes' ? 'min' : unit, dimensionKey: 'time' }); }
    timeUntilNextStart(unit = 'minutes') { const scale = unit === 'milliseconds' ? 1 : unit === 'seconds' ? 1000 : unit === 'minutes' ? 60000 : 3600000; return this.build((event: any, index: number) => this.events[index + 1] ? (this.events[index + 1].startedAtMs - event.startedAtMs) / scale : null, 'Time until next start', { key: unit, symbol: unit === 'minutes' ? 'min' : unit, dimensionKey: 'time' }); }
    filter(predicate: any, options: any = {}, context?: any) { const filtered = this.events.filter((event: any, index: number) => { const keep = predicate(event, index, options, context); if (typeof keep !== 'boolean') throw new Error('EventSeries.filter predicate must return boolean'); return keep; }); return new EventSeries({ key: this.key, label: this.label, unit: this.unit, events: filtered.map((event: any) => ({ id: event.id, startedAt: event.startedAt, endedAt: event.endedAt, displayValue: event.value, textValue: event.textValue, note: event.note, ongoing: event.ongoing, inRequestedRange: event.inRequestedRange, ...(event.calendarBucketStarts ? { calendarBucketStarts: event.calendarBucketStarts } : {}) })) }, this.nowMs); }
    count(options: any = {}) { const events = options.scope === 'all' ? this.events : this.events.filter((event: any) => event.inRequestedRange); return new ScalarValue(events.length, `${(this as any).label} count`); }
    first(options: any = {}) { return (options.scope === 'all' ? this.events : this.events.filter((event: any) => event.inRequestedRange))[0] ?? null; }
    latest(options: any = {}) { return (options.scope === 'all' ? this.events : this.events.filter((event: any) => event.inRequestedRange)).at(-1) ?? null; }
  }
  class SeriesSet { constructor(readonly series: readonly any[], readonly title: string | null = null) { Object.freeze(this.series); Object.freeze(this); } static of(...series: any[]) { return new SeriesSet(series); } withTitle(title: string) { return new SeriesSet(this.series, title); } }
  class AnalysisContext { constructor(input: any) { Object.assign(this, input, { fromMs: Date.parse(input.from), toMs: Date.parse(input.to), nowMs: Date.parse(input.now) }); Object.freeze(this); } }
  Object.assign(globalThis, { EventRecord, EventSeries, NumericPoint, NumericSeries, NumericWindow, ScalarValue, SeriesSet, UnitDescriptor, AnalysisContext, MapFilterResult });
  for (const key of ['EventRecord', 'EventSeries', 'NumericPoint', 'NumericSeries', 'NumericWindow', 'ScalarValue', 'SeriesSet', 'UnitDescriptor', 'AnalysisContext', 'MapFilterResult']) Object.freeze((globalThis as any)[key]);
}

export const QUICKJS_BOOTSTRAP_SOURCE = `(${guestBootstrap.toString()})();`;
