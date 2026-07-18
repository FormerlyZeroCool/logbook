import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);

test('continuous timestamp charts do not use Recharts categorical bars', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');

  assert.doesNotMatch(charts, /<BarChart/);
  assert.doesNotMatch(charts, /<Bar\s/);
  assert.match(charts, /id="duration-fill"/);
  assert.match(charts, /dataKey="durationMinutes"/);
  assert.match(charts, /<ComposedChart/);
  assert.match(charts, /<Line/);
  assert.match(charts, /yAxisId="interval"/);
  assert.match(charts, /dataKey="displayValue"/);
});
