import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chartsSource = readFileSync(new URL('../src/components/Charts.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/pages/EventTypePage.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('event type page overlays event intervals on recorded values and pairs duration with value-rate', () => {
  assert.match(pageSource, /<ValueChart[\s\S]*?intervalSourcePoints=\{series\.durationPoints\}[\s\S]*?<div className="insight-chart-grid">[\s\S]*?<DurationChart points=\{series\.durationPoints\}[\s\S]*?<EventRateChart points=\{series\.durationPoints\}/);
  assert.doesNotMatch(pageSource, /<EventIntervalChart/);
  assert.match(stylesSource, /\.insight-chart-grid \{ @apply grid gap-5 md:grid-cols-2; \}/);
});

test('new insight charts use continuous time axes and detailed event tooltips', () => {
  assert.match(chartsSource, /name="Time until next start"/);
  assert.match(chartsSource, /yAxisId="interval"/);
  assert.match(chartsSource, /orientation="right"/);
  assert.match(chartsSource, /title=\{`Value ÷ duration \(\$\{unitLabel\}\)`\}/);
  assert.match(chartsSource, /dataKey="intervalMinutes"/);
  assert.match(chartsSource, /dataKey="valuePerMinute"/);
  assert.equal((chartsSource.match(/scale="time"/g) ?? []).length, 3);
  assert.match(chartsSource, /buildEventTooltipRows/);
});
