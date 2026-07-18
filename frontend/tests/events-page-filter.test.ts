import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const eventsPageUrl = new URL('../src/pages/EventsPage.tsx', import.meta.url);

test('Events page exposes a visible event type filter', async (): Promise<void> => {
  const source = await readFile(eventsPageUrl, 'utf8');

  assert.match(source, /<span>Event type<\/span>/);
  assert.match(source, /<option value="">All event types<\/option>/);
  assert.match(source, /setEventTypeKey\(event\.target\.value\)/);
  assert.match(source, /eventTypeKey \? \{ eventTypeKey \} : \{\}/);
});
