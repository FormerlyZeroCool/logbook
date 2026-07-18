import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildValueChartData,
  getSeriesBucket,
  isBucketedValueAggregation
} from '../src/value-aggregation.ts';
import type { SeriesPoint, ValueSeriesPoint } from '../src/types.ts';

const rawPoints: ValueSeriesPoint[] = [
  {
    eventId: 'one', eventKind: 'point', at: '2026-07-16T10:05:00.000Z', endedAt: '2026-07-16T10:05:00.000Z',
    value: 2.5, canonicalValue: 2.5, textValue: 'first', note: 'morning', durationSeconds: 0, ongoing: false
  },
  {
    eventId: 'two', eventKind: 'duration', at: '2026-07-16T10:35:00.000Z', endedAt: '2026-07-16T10:45:00.000Z',
    value: 3.5, canonicalValue: 3.5, textValue: null, note: null, durationSeconds: 600, ongoing: false
  }
];

const aggregatePoints: SeriesPoint[] = [
  {
    bucket: '2026-07-16T10:00:00.000Z',
    eventCount: 2,
    valueAvg: 3,
    valueMin: 2.5,
    valueMax: 3.5,
    valueSum: 6,
    durationAvgSeconds: null,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    durationSumSeconds: null
  },
  {
    bucket: '2026-07-16T11:00:00.000Z',
    eventCount: 1,
    valueAvg: null,
    valueMin: null,
    valueMax: null,
    valueSum: null,
    durationAvgSeconds: 300,
    durationMinSeconds: 300,
    durationMaxSeconds: 300,
    durationSumSeconds: 300
  }
];

test('individual value chart data keeps one point per numeric event', (): void => {
  assert.deepEqual(buildValueChartData(rawPoints, aggregatePoints, 'events'), [
    {
      at: rawPoints[0]!.at, displayValue: 2.5, eventCount: 1, eventId: 'one',
      endedAt: rawPoints[0]!.endedAt, textValue: 'first', note: 'morning', durationSeconds: 0, ongoing: false
    },
    {
      at: rawPoints[1]!.at, displayValue: 3.5, eventCount: 1, eventId: 'two',
      endedAt: rawPoints[1]!.endedAt, textValue: null, note: null, durationSeconds: 600, ongoing: false
    }
  ]);
});

test('bucketed value chart data uses value sums and omits buckets without numeric values', (): void => {
  assert.deepEqual(buildValueChartData(rawPoints, aggregatePoints, '1 hour'), [
    {
      at: aggregatePoints[0]!.bucket, displayValue: 6, eventCount: 2, eventId: null, endedAt: null,
      textValue: null, note: null, durationSeconds: null, ongoing: false
    }
  ]);
});

test('selected aggregation controls the server bucket while individual mode keeps the range default', (): void => {
  assert.equal(getSeriesBucket('events', '6 hours'), '6 hours');
  assert.equal(getSeriesBucket('1 day', '6 hours'), '1 day');
  assert.equal(isBucketedValueAggregation('events'), false);
  assert.equal(isBucketedValueAggregation('15 minutes'), true);
});
