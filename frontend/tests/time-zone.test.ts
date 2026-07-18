import assert from 'node:assert/strict';
import test from 'node:test';
import { getBrowserTimeZone } from '../src/time-zone.ts';

test('browser time zone helper returns a usable identifier', () => {
  const timeZone = getBrowserTimeZone();
  assert.equal(typeof timeZone, 'string');
  assert.ok(timeZone.length > 0);
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone }).format());
});
