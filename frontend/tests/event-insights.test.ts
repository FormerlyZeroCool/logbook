import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventIntervalPoints, buildEventRatePoints } from '../src/duration.ts';
import type { DurationSeriesPoint } from '../src/types.ts';

function point(overrides: Partial<DurationSeriesPoint>): DurationSeriesPoint {
  return {
    eventId: 'event',
    eventKind: 'duration',
    startedAt: '2026-07-16T10:00:00.000Z',
    endedAt: '2026-07-16T10:10:00.000Z',
    value: 10,
    canonicalValue: 10,
    textValue: null,
    note: null,
    durationSeconds: 600,
    ongoing: false,
    ...overrides
  };
}

test('buildEventIntervalPoints attaches each start-to-start gap to the earlier event', () => {
  const result = buildEventIntervalPoints([
    point({ eventId: 'third', startedAt: '2026-07-16T11:45:00.000Z' }),
    point({ eventId: 'first', startedAt: '2026-07-16T10:00:00.000Z' }),
    point({ eventId: 'second', startedAt: '2026-07-16T10:30:00.000Z' })
  ]);

  assert.deepEqual(result.map((item) => ({
    eventId: item.eventId,
    nextEventId: item.nextEventId,
    intervalSeconds: item.intervalSeconds
  })), [
    { eventId: 'first', nextEventId: 'second', intervalSeconds: 1800 },
    { eventId: 'second', nextEventId: 'third', intervalSeconds: 4500 }
  ]);
});

test('buildEventRatePoints returns value per elapsed minute', () => {
  const result = buildEventRatePoints([
    point({ eventId: 'feeding', value: 8, durationSeconds: 1200 })
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.valuePerMinute, 0.4);
  assert.equal(result[0]?.displayDurationSeconds, 1200);
});

test('buildEventRatePoints skips events without a positive duration or numeric value', () => {
  const result = buildEventRatePoints([
    point({ eventId: 'point', eventKind: 'point', durationSeconds: 0 }),
    point({ eventId: 'text-only', value: null }),
    point({ eventId: 'valid', value: 3, durationSeconds: 180 })
  ]);

  assert.deepEqual(result.map((item) => item.eventId), ['valid']);
});

test('buildEventRatePoints uses live elapsed time for ongoing events', () => {
  const result = buildEventRatePoints([
    point({
      eventId: 'ongoing',
      startedAt: '2026-07-16T10:00:00.000Z',
      endedAt: null,
      durationSeconds: 0,
      ongoing: true,
      value: 6
    })
  ], Date.parse('2026-07-16T10:30:00.000Z'));

  assert.equal(result[0]?.displayDurationSeconds, 1800);
  assert.equal(result[0]?.valuePerMinute, 0.2);
});
