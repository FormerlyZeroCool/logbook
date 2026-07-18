import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../src/pages/EventTypePage.tsx', import.meta.url);
const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);
const stylesUrl = new URL('../src/styles.css', import.meta.url);

test('event type charts expose synchronized presets and custom date-time inputs', async (): Promise<void> => {
  const page = await readFile(pageUrl, 'utf8');
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(page, /chartRangePresets\.map/);
  assert.match(page, /buildPresetSelection\('7d'\)/);
  assert.equal((page.match(/type="datetime-local"/g) ?? []).length, 2);
  assert.match(page, /aria-label="Chart start date and time"/);
  assert.match(page, /aria-label="Chart end date and time"/);
  assert.match(page, /updateCustomInput\('fromInput'/);
  assert.match(page, /updateCustomInput\('toInput'/);
  assert.match(page, /onTimeRangeSelect=\{selectChartRange\}/);
  assert.match(page, /drag across the Recorded values chart to zoom/);
  assert.match(styles, /\.date-range-editor/);
});

test('dragging across the recorded values chart selects a timestamp range', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');

  assert.match(charts, /onTimeRangeSelect\?: \(fromMs: number, toMs: number\) => void/);
  assert.match(charts, /onMouseDown=\{beginRangeSelection\}/);
  assert.match(charts, /onMouseMove=\{continueRangeSelection\}/);
  assert.match(charts, /onMouseUp=\{finishRangeSelection\}/);
  assert.match(charts, /<ReferenceArea/);
  assert.match(charts, /x1=\{Math\.min\(rangeStartMs, rangeEndMs\)\}/);
  assert.match(charts, /onTimeRangeSelect\(fromMs, toMs\)/);
});
