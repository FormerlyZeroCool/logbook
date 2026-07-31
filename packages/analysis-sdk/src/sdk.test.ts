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
  it('preserves zero through map and explicit mapFilter keep', () => {
    const series = new EventSeries(input, 1_000_000).values();
    expect(series.map((value) => value).points.filter((point) => point.value === 0)).toHaveLength(3);
    expect(series.mapFilter((value) => value === null ? MapFilterResult.drop() : MapFilterResult.keep(value)).points.filter((point) => point.value === 0)).toHaveLength(3);
  });
  it('uses context rows for windows and clips serialization', () => {
    const output = new EventSeries(input, 1_000_000).values().transformWindow((window) => window.validValues().reduce((a, b) => a + b, 0), 2, { partial: false });
    expect(output.points[1]?.value).toBe(1);
    expect(output.toJSON().points).toHaveLength(5);
  });
  it('reduces visible rows by default', () => {
    const scalar = new EventSeries(input, 1_000_000).values().sum();
    expect(scalar.value).toBe(2);
  });

  it('maps non-null values ergonomically and preserves null points', () => {
    const series = new EventSeries({
      ...input,
      events: [
        { ...input.events[0]!, displayValue: 2 },
        { ...input.events[1]!, displayValue: null },
        { ...input.events[2]!, displayValue: -3 },
      ],
    }, 1_000_000).values();
    expect(series.map((value) => value * 1000).points.map((point) => point.value)).toEqual([2000, null, -3000]);
  });
});
