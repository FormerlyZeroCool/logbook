import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardUrl = new URL('../src/components/EventTypeCard.tsx', import.meta.url);
const dashboardUrl = new URL('../src/pages/DashboardPage.tsx', import.meta.url);

test('activity cards display elapsed time from latest start and finish', async (): Promise<void> => {
  const card = await readFile(cardUrl, 'utf8');
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(card, /Last event start/);
  assert.match(card, /formatTimeSinceStart\(eventType\.latestStartedAt, nowMs\)/);
  assert.match(card, /Last event finish/);
  assert.match(card, /formatTimeSinceFinish\(eventType\.latestEndedAt, nowMs\)/);
  assert.match(dashboard, /const nowMs = useCurrentTime\(\)/);
  assert.match(dashboard, /eventType=\{eventType\} nowMs=\{nowMs\}/);
});
