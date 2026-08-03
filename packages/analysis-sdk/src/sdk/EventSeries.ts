import type { AnalysisInputDto } from '../contracts.js';
import { EventRecord } from './EventRecord.js';
import { NumericPoint } from './NumericPoint.js';
import { NumericSeries } from './NumericSeries.js';
import { ScalarValue } from './ScalarValue.js';

function durationScale(unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours'): number {
  return unit === 'milliseconds' ? 1 : unit === 'seconds' ? 1_000 : unit === 'minutes' ? 60_000 : 3_600_000;
}

export class EventSeries {
  readonly events: readonly EventRecord[];
  readonly key: string;
  readonly label: string;
  readonly unit: AnalysisInputDto['unit'];
  private readonly nowMs: number;

  constructor(input: AnalysisInputDto, nowMs: number) {
    this.key = input.key;
    this.label = input.label;
    this.unit = input.unit;
    this.nowMs = nowMs;
    this.events = Object.freeze(input.events.map((event) => new EventRecord(event, input.unit, nowMs)).sort((a, b) => a.startedAtMs - b.startedAtMs || a.id.localeCompare(b.id)));
    Object.freeze(this);
  }

  values(): NumericSeries {
    return this.fromEvents((event) => event.value, this.label, this.unit);
  }
  value(): NumericSeries { return this.values(); }
  starts(): NumericSeries { return this.fromEvents((event) => event.startedAtMs, `${this.label} starts`, null); }
  ends(): NumericSeries { return this.fromEvents((event) => event.endedAtMs, `${this.label} ends`, null); }
  durations(unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' = 'seconds'): NumericSeries {
    const scale = durationScale(unit);
    return this.fromEvents((event) => event.durationMs === null ? null : event.durationMs / scale, `${this.label} duration`, { key: unit, symbol: unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : unit === 'seconds' ? 's' : 'ms', dimensionKey: 'time' });
  }
  timeBetweenStarts(unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' = 'minutes'): NumericSeries {
    const scale = durationScale(unit);
    return this.fromEvents((_event, index) => index === 0 ? null : (this.events[index]!.startedAtMs - this.events[index - 1]!.startedAtMs) / scale, `${this.label} time between starts`, { key: unit, symbol: unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : unit === 'seconds' ? 's' : 'ms', dimensionKey: 'time' });
  }
  timeUntilNextStart(unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' = 'minutes'): NumericSeries {
    const scale = durationScale(unit);
    return this.fromEvents((event, index) => this.events[index + 1] ? (this.events[index + 1]!.startedAtMs - event.startedAtMs) / scale : null, `${this.label} time until next start`, { key: unit, symbol: unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : unit === 'seconds' ? 's' : 'ms', dimensionKey: 'time' });
  }
  filter(
    predicate: ((event: EventRecord, index: number, context: unknown) => boolean)
      | ((event: EventRecord, index: number, options: Record<string, unknown>, context: unknown) => boolean),
    contextOrOptions?: unknown,
    legacyContext?: unknown,
  ): EventSeries {
    const legacy = predicate.length >= 4;
    const options = legacy && typeof contextOrOptions === 'object' && contextOrOptions !== null
      ? contextOrOptions as Record<string, unknown>
      : {};
    const context = legacy ? legacyContext : contextOrOptions;
    const events = this.events.filter((event, index) => {
      const result = legacy
        ? (predicate as (event: EventRecord, index: number, options: Record<string, unknown>, context: unknown) => boolean)(event, index, options, context)
        : (predicate as (event: EventRecord, index: number, context: unknown) => boolean)(event, index, context);
      if (typeof result !== 'boolean') throw new Error('EventSeries.filter predicate must return boolean');
      return result;
    });
    const input: AnalysisInputDto = {
      key: this.key,
      label: this.label,
      unit: this.unit,
      events: events.map((event) => ({ id: event.id, startedAt: event.startedAt, endedAt: event.endedAt, displayValue: event.value, textValue: event.textValue, note: event.note, ongoing: event.ongoing, inRequestedRange: event.inRequestedRange, ...(event.calendarBucketStarts ? { calendarBucketStarts: event.calendarBucketStarts } : {}) }))
    };
    return new EventSeries(input, this.nowMs);
  }
  first(options: { scope?: 'visible' | 'all' } = {}): EventRecord | null {
    return (options.scope === 'all' ? this.events : this.events.filter((event) => event.inRequestedRange))[0] ?? null;
  }
  latest(options: { scope?: 'visible' | 'all' } = {}): EventRecord | null {
    return (options.scope === 'all' ? this.events : this.events.filter((event) => event.inRequestedRange)).at(-1) ?? null;
  }
  count(options: { scope?: 'visible' | 'all' } = {}): ScalarValue {
    return new ScalarValue((options.scope === 'all' ? this.events : this.events.filter((event) => event.inRequestedRange)).length, `${this.label} count`);
  }

  private fromEvents(mapper: (event: EventRecord, index: number) => number | null, label: string, unit: AnalysisInputDto['unit']): NumericSeries {
    const points = this.events.map((event, index) => new NumericPoint({
      time: event.startedAt,
      timeMs: event.startedAtMs,
      value: mapper(event, index),
      eventId: event.id,
      note: event.note,
      textValue: event.textValue,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      inRequestedRange: event.inRequestedRange,
      ...(event.calendarBucketStarts ? { calendarBucketStarts: event.calendarBucketStarts } : {})
    }));
    return new NumericSeries(points, label, unit);
  }
}
