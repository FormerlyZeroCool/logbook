import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimedPoints, buildTimeAxisDomain } from '../src/time-axis.ts';

test('time-axis points retain real elapsed-time distances and sort chronologically', (): void => {
  const points = buildTimedPoints([
    { id: 'late', at: '2026-07-16T12:10:00.000Z' },
    { id: 'early', at: '2026-07-16T12:00:00.000Z' },
    { id: 'nearby', at: '2026-07-16T12:01:00.000Z' }
  ], (point) => point.at);

  assert.deepEqual(points.map((point) => point.id), ['early', 'nearby', 'late']);
  assert.equal(points[1].timestamp - points[0].timestamp, 60_000);
  assert.equal(points[2].timestamp - points[1].timestamp, 9 * 60_000);
});

test('time-axis domain pads both multi-point and single-point series', (): void => {
  const multi = buildTimedPoints([
    { at: '2026-07-16T12:00:00.000Z' },
    { at: '2026-07-16T13:00:00.000Z' }
  ], (point) => point.at);
  const multiDomain = buildTimeAxisDomain(multi);

  assert.ok(multiDomain[0] < multi[0].timestamp);
  assert.ok(multiDomain[1] > multi[1].timestamp);

  const single = buildTimedPoints([{ at: '2026-07-16T12:00:00.000Z' }], (point) => point.at);
  const singleDomain = buildTimeAxisDomain(single);
  assert.equal(singleDomain[1] - singleDomain[0], 60 * 60_000);
});

test('invalid timestamps are excluded from chart data', (): void => {
  const points = buildTimedPoints([
    { id: 'valid', at: '2026-07-16T12:00:00.000Z' },
    { id: 'invalid', at: 'not-a-date' }
  ], (point) => point.at);

  assert.deepEqual(points.map((point) => point.id), ['valid']);
});
