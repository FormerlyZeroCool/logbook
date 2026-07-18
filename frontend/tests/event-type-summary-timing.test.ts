import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatTimeSinceCompact } from '../src/format.ts';

const pageUrl = new URL('../src/pages/EventTypePage.tsx', import.meta.url);
const nowMs = Date.parse('2026-07-17T12:00:00.000Z');

test('event type summary replaces storage unit with live last-event timing', async (): Promise<void> => {
  const page = await readFile(pageUrl, 'utf8');

  assert.doesNotMatch(page, /<span>Stored as<\/span>/);
  assert.match(page, /<span>Time since last event<\/span>/);
  assert.match(page, /Start: \{formatTimeSinceCompact\(latestEvent\?\.startedAt/);
  assert.match(page, /End: \{latestEvent\?\.endedAt/);
  assert.match(page, /latestEvent\?\.ongoing \? 'Ongoing'/);
  assert.match(page, /const nowMs = useCurrentTime\(\)/);
  assert.match(page, /selectLatestEvent\(latestEventQuery\.data, eventType\?\.recentEvents, events\)/);
  assert.doesNotMatch(page, /eventType\?\.recentEvents\[0\]/);
});

test('compact elapsed time uses readable minute and hour labels without redundant ago text', (): void => {
  assert.equal(formatTimeSinceCompact('2026-07-17T11:50:00.000Z', '—', nowMs), '10 min');
  assert.equal(formatTimeSinceCompact('2026-07-17T09:55:00.000Z', '—', nowMs), '2 hr 5 min');
  assert.equal(formatTimeSinceCompact(null, '—', nowMs), '—');
});
