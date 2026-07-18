import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomTimeWindow,
  buildPresetTimeWindow,
  chartRangePresets,
  formatDateTimeLocal,
  getDefaultSeriesBucket,
  parseDateTimeLocal
} from '../src/chart-range.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

test('chart range presets include the requested short and medium windows', (): void => {
  assert.deepEqual(
    chartRangePresets.map((preset: typeof chartRangePresets[number]) => preset.key),
    ['24h', '2d', '3d', '7d', '14d', '30d', '90d']
  );
});

test('preset windows end at the selection time and choose a useful default bucket', (): void => {
  const nowMs = Date.parse('2026-07-17T12:00:00.000Z');
  assert.deepEqual(buildPresetTimeWindow('2d', nowMs), {
    fromMs: nowMs - (2 * DAY_MS),
    toMs: nowMs,
    bucket: '15 minutes'
  });
  assert.equal(buildPresetTimeWindow('3d', nowMs).bucket, '1 hour');
  assert.equal(buildPresetTimeWindow('14d', nowMs).bucket, '1 hour');
});

test('custom windows validate order and choose a bucket from their elapsed time', (): void => {
  const fromMs = Date.parse('2026-07-01T00:00:00.000Z');
  assert.equal(buildCustomTimeWindow(fromMs, fromMs), null);
  assert.equal(buildCustomTimeWindow(fromMs + 1, fromMs), null);
  assert.equal(buildCustomTimeWindow(fromMs, fromMs + (30 * DAY_MS))?.bucket, '6 hours');
  assert.equal(getDefaultSeriesBucket(fromMs, fromMs + (90 * DAY_MS)), '1 day');
});

test('datetime-local values round trip through the browser-local timezone', (): void => {
  const timestampMs = new Date(2026, 0, 15, 9, 30, 45).getTime();
  assert.equal(parseDateTimeLocal(formatDateTimeLocal(timestampMs)), timestampMs);
});
