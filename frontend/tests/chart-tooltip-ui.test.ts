import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);
const pageUrl = new URL('../src/pages/EventTypePage.tsx', import.meta.url);

test('individual value and duration charts use rich event detail tooltips', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(charts, /buildEventTooltipRows/);
  assert.match(charts, /CombinedValueIntervalTooltip/);
  assert.match(charts, /DurationEventTooltip/);
  assert.match(charts, /Value totals use the selected aggregation; each time gap is attached to the event before it/);
  assert.match(page, /<DurationChart points=\{series\.durationPoints\} unit=\{displayUnit\} \/>/);
});
