import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);

test('all plotted event points use moderate opaque markers with a black outline and no glow', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');

  assert.match(charts, /function chartDot\(fill: string\)/);
  assert.match(charts, /r: 4/);
  assert.match(charts, /fillOpacity: 1/);
  assert.match(charts, /opacity: 1/);
  assert.match(charts, /stroke: '#000000'/);
  assert.doesNotMatch(charts, /drop-shadow|filter:/);
  assert.match(charts, /function activeChartDot\(fill: string\)/);
  assert.match(charts, /r: 6/);
  assert.equal((charts.match(/dot=\{chartDot\(/g) ?? []).length, 4);
  assert.equal((charts.match(/activeDot=\{activeChartDot\(/g) ?? []).length, 4);
});
