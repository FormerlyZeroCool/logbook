import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveChartTimeWindow, type ChartRangeWindow } from '../src/chart-range.ts';

const mainUrl = new URL('../src/main.tsx', import.meta.url);
const pageUrl = new URL('../src/pages/EventTypePage.tsx', import.meta.url);
const clockUrl = new URL('../src/use-current-time.ts', import.meta.url);

const DAY_MS = 24 * 60 * 60 * 1000;

test('all active frontend queries poll every ten seconds, including in a background iframe', async (): Promise<void> => {
  const main = await readFile(mainUrl, 'utf8');

  assert.match(main, /AUTO_REFRESH_INTERVAL_MS = 10_000/);
  assert.match(main, /refetchInterval: AUTO_REFRESH_INTERVAL_MS/);
  assert.match(main, /refetchIntervalInBackground: true/);
  assert.match(main, /refetchOnWindowFocus: true/);
  assert.match(main, /refetchOnReconnect: true/);
  assert.match(main, /structuralSharing: true/);
});

test('relative-time and ongoing-duration displays update every ten seconds', async (): Promise<void> => {
  const clock = await readFile(clockUrl, 'utf8');
  assert.match(clock, /intervalMs: number = 10_000/);
});

test('preset chart ranges roll forward while custom chart ranges remain fixed', (): void => {
  const oldNow = Date.parse('2026-07-18T12:00:00.000Z');
  const newNow = Date.parse('2026-07-18T12:10:00.000Z');
  const preset: ChartRangeWindow = {
    mode: '2d',
    fromMs: oldNow - (2 * DAY_MS),
    toMs: oldNow,
    bucket: '15 minutes',
  };

  assert.deepEqual(resolveChartTimeWindow(preset, newNow), {
    fromMs: newNow - (2 * DAY_MS),
    toMs: newNow,
    bucket: '15 minutes'
  });

  const custom: ChartRangeWindow = {
    ...preset,
    mode: 'custom',
    fromMs: oldNow - DAY_MS,
    toMs: oldNow
  };
  assert.deepEqual(resolveChartTimeWindow(custom, newNow), {
    fromMs: oldNow - DAY_MS,
    toMs: oldNow,
    bucket: '15 minutes'
  });
});

test('series polling resolves the active window at request time instead of freezing page-load timestamps', async (): Promise<void> => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /const activeWindow = resolveChartTimeWindow\(rangeSelection\)/);
  assert.match(page, /new Date\(activeWindow\.fromMs\)\.toISOString\(\)/);
  assert.match(page, /new Date\(activeWindow\.toMs\)\.toISOString\(\)/);
  assert.match(page, /rangeSelection\.mode === 'custom' \? rangeSelection\.fromMs : null/);
  assert.match(page, /visibleRangeSelection/);
});
