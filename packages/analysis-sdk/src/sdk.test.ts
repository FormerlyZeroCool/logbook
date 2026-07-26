import { describe, expect, it } from 'vitest';
import { EventSeries, MapFilterResult } from './index.js';

const input = {
  key: 'feeding', label: 'Feeding', unit: { key: 'ml', symbol: 'mL', dimensionKey: 'volume' },
  events: [0, 1, 0, -1, 2, 0].map((value, index) => ({ id: String(index), startedAt: new Date(index * 60_000).toISOString(), endedAt: new Date(index * 60_000 + 30_000).toISOString(), displayValue: value, textValue: null, note: null, ongoing: false, inRequestedRange: index > 0 }))
};

describe('analysis SDK', () => {
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
});
