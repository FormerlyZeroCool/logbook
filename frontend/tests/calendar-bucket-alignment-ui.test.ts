import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/pages/EventTypePage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');

test('series requests include the browser time zone for calendar-aligned buckets', () => {
  assert.match(page, /getBrowserTimeZone\(\)/);
  assert.match(page, /browserTimeZone,/);
  assert.match(api, /new URLSearchParams\(\{ from, to, bucket, timeZone \}\)/);
});
