import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chartsUrl = new URL('../src/components/Charts.tsx', import.meta.url);
const stylesUrl = new URL('../src/styles.css', import.meta.url);

test('recorded values chart can independently focus the value or interval curve', async (): Promise<void> => {
  const charts = await readFile(chartsUrl, 'utf8');
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(charts, /const \[showValues, setShowValues\] = useState\(true\)/);
  assert.match(charts, /const \[showIntervals, setShowIntervals\] = useState\(true\)/);
  assert.match(charts, /aria-label="Toggle recorded values curve"/);
  assert.match(charts, /aria-label="Toggle time between starts curve"/);
  assert.match(charts, /disabled=\{!hasValueData \|\| \(valuesVisible && !intervalsVisible\)\}/);
  assert.match(charts, /disabled=\{!hasIntervalData \|\| \(intervalsVisible && !valuesVisible\)\}/);
  assert.match(charts, /\{valuesVisible && \(\s*<YAxis[\s\S]*?yAxisId="value"/);
  assert.match(charts, /\{intervalsVisible && \(\s*<YAxis[\s\S]*?yAxisId="interval"/);
  assert.match(charts, /\{valuesVisible && \(\s*<Area[\s\S]*?dataKey="displayValue"/);
  assert.match(charts, /\{intervalsVisible && \(\s*<Line[\s\S]*?dataKey="intervalMinutes"/);
  assert.match(charts, /name="Time until next start"/);
  assert.match(charts, /label: 'Until next start'/);
  assert.match(charts, /label: 'Next start'/);
  assert.match(charts, /const valuesVisible = showValues && hasValueData/);
  assert.match(charts, /const intervalsVisible = showIntervals && hasIntervalData/);
  assert.match(charts, /const visibleData = data\.filter/);
  assert.match(styles, /\.chart-series-toggles/);
  assert.match(styles, /\.chart-series-toggle\[aria-pressed='true'\]/);
});
