import { describe, expect, it } from 'vitest';
import { EventSeries, MapFilterResult } from './index.js';

const input = {
  key: 'feeding', label: 'Feeding', unit: { key: 'ml', symbol: 'mL', dimensionKey: 'volume' },
  events: [0, 1, 0, -1, 2, 0].map((value, index) => ({ id: String(index), startedAt: new Date(index * 60_000).toISOString(), endedAt: new Date(index * 60_000 + 30_000).toISOString(), displayValue: value, textValue: null, note: null, ongoing: false, inRequestedRange: index > 0 }))
};

describe('analysis SDK', () => {
  it('maps immutable points ergonomically with mapPoints', () => {
    const series = new EventSeries(input, 1_000_000).values();
    const output = series.mapPoints((point) => point.withValue((point.value ?? 0) * 2));
    expect(output.points.map((point) => point.value)).toEqual([0, 2, 0, -2, 4, 0]);
    expect(output.points[1]?.eventId).toBe(series.points[1]?.eventId);
    expect(output.points[1]).not.toBe(series.points[1]);
    expect(() => series.mapPoints(() => ({ value: 1 }) as never)).toThrow(/NumericPoint/);
  });
  it('infers point-returning map callbacks and preserves returned point metadata', () => {
    const series = new EventSeries({
      ...input,
      events: [
        { ...input.events[0]!, displayValue: null },
        { ...input.events[1]!, displayValue: 2 },
        { ...input.events[2]!, displayValue: -3 },
      ],
    }, 1_000_000).values();
    const inline = series.map((value, point) => point.withValue((value ?? 0) * 10));
    expect(inline.points.map((point) => point.value)).toEqual([0, 20, -30]);

    const savedMapper = (value: number | null, point: typeof series.points[number]) => point.withValue((value ?? 0) * 10);
    const output = series.map(savedMapper);
    expect(output.points.map((point) => point.value)).toEqual([0, 20, -30]);
    expect(output.points.map((point) => point.eventId)).toEqual(series.points.map((point) => point.eventId));
    expect(() => series.map(() => 42 as never)).toThrow(/NumericPoint/);
  });

  it('mapValues preserves nulls while mapping every non-null value', () => {
    const series = new EventSeries({
      ...input,
      events: [
        { ...input.events[0]!, displayValue: null },
        { ...input.events[1]!, displayValue: 2 },
        { ...input.events[2]!, displayValue: -3 },
      ],
    }, 1_000_000).values();
    expect(series.mapValues((value) => value * 1000).points.map((point) => point.value)).toEqual([null, 2000, -3000]);
  });

  it('preserves zero through map and explicit mapFilter keep', () => {
    const series = new EventSeries(input, 1_000_000).values();
    expect(series.map((value, point) => point.withValue(value)).points.filter((point) => point.value === 0)).toHaveLength(3);
    expect(series.mapFilter((value) => value === null ? MapFilterResult.drop() : MapFilterResult.keep(value)).points.filter((point) => point.value === 0)).toHaveLength(3);
  });
  it('uses NumericPoint | null as the map/filter contract', () => {
    const series = new EventSeries(input, 1_000_000).values();
    const output = series.mapFilter((value, point) => value !== null && value > 0
      ? point.withValue(value * 10)
      : null);
    expect(output.points.map((point) => point.value)).toEqual([10, 20]);
    expect(output.points.map((point) => point.eventId)).toEqual(['1', '4']);
    expect(() => series.mapFilter(() => 42 as never)).toThrow(/NumericPoint.*null/);
  });
  it('uses context rows for windows and clips serialization', () => {
    const output = new EventSeries(input, 1_000_000).values().transformWindow((window, windowSize) => window.anchorPoint.withValue(window.validValues().reduce((a, b) => a + b, 0) / windowSize), 2, { partial: false });
    expect(output.points[1]?.value).toBe(0.5);
    expect(output.toJSON().points).toHaveLength(5);
  });
  it('reduces visible rows by default', () => {
    const scalar = new EventSeries(input, 1_000_000).values().sum();
    expect(scalar.value).toBe(2);
  });

  it('wraps numeric and string reducer results as displayable scalars', () => {
    const series = new EventSeries(input, 1_000_000).values();
    const numeric = series.reduce((values) => values.filter((value): value is number => value !== null).length);
    expect(numeric.value).toBe(5);
    expect(numeric.unit?.symbol).toBe('mL');

    const text = series.reduce((values) => values.some((value) => value !== null) ? 'has values' : 'empty');
    expect(text.value).toBe('has values');
    expect(text.unit).toBeNull();
    expect(() => series.reduce(() => ({ invalid: true }) as never)).toThrow(/number, string, or null/);
  });

  it('maps non-null values ergonomically through mapValues and preserves null points', () => {
    const series = new EventSeries({
      ...input,
      events: [
        { ...input.events[0]!, displayValue: 2 },
        { ...input.events[1]!, displayValue: null },
        { ...input.events[2]!, displayValue: -3 },
      ],
    }, 1_000_000).values();
    expect(series.mapValues((value) => value * 1000).points.map((point) => point.value)).toEqual([2000, null, -3000]);
  });

  it('uses typed curried mapper parameters without losing point metadata', () => {
    const series = new EventSeries(input, 1_000_000).values();
    const clamp = (min: number, max: number) => (
      value: number | null,
      point: typeof series.points[number],
    ) => value === null ? point : point.withValue(Math.min(max, Math.max(min, value)));
    const output = series.map(clamp(0, 1));
    expect(output.points.map((point) => point.value)).toEqual([0, 1, 0, 0, 1, 0]);
    expect(output.points.map((point) => point.eventId)).toEqual(series.points.map((point) => point.eventId));
  });


});
