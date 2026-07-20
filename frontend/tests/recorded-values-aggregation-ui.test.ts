import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);
const pageUrl = new URL('../src/pages/EventTypePage.tsx', import.meta.url);

test('Recorded values chart exposes bucket-sum aggregation controls', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(charts, /<span>Aggregation<\/span>/);
  assert.match(charts, /aria-label="Recorded values aggregation"/);
  assert.match(charts, /Values are summed into/);
  assert.match(page, /aggregatePoints=\{series\.points\}/);
  assert.match(page, /intervalSourcePoints=\{series\.durationPoints\}/);
  assert.match(charts, /<ComposedChart/);
  assert.match(charts, /yAxisId="value"/);
  assert.match(charts, /yAxisId="interval"/);
  assert.match(charts, /orientation="right"/);
  assert.match(page, /valueAggregation/);
  assert.match(page, /getSeriesBucket\(valueAggregation, activeWindow\.bucket\)/);
  assert.match(page, /onAggregationChange=\{setValueAggregation\}/);
});
