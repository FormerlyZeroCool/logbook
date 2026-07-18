import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardUrl = new URL('../src/pages/DashboardPage.tsx', import.meta.url);

test('recent activity always requests exactly three events per type', async (): Promise<void> => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(dashboard, /const recentLimit = 3;/);
  assert.match(dashboard, /api\.listEventTypes\(recentLimit, showArchived\)/);
  assert.doesNotMatch(dashboard, /Recent per type/);
  assert.doesNotMatch(dashboard, /setRecentLimit/);
});
