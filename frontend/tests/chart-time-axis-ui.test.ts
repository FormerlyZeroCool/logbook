import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);

test('value and duration charts use a continuous timestamp x-axis', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');

  assert.match(charts, /buildTimedPoints/);
  assert.match(charts, /buildTimeAxisDomain/);
  assert.equal((charts.match(/type="number"/g) ?? []).length, 3);
  assert.equal((charts.match(/scale="time"/g) ?? []).length, 3);
  assert.equal((charts.match(/dataKey="timestamp"/g) ?? []).length, 3);
  assert.equal((charts.match(/domain=\{timeDomain\}/g) ?? []).length, 3);
  assert.doesNotMatch(charts, /<XAxis dataKey="at"/);
  assert.doesNotMatch(charts, /<XAxis dataKey="startedAt"/);
});
