import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimeSinceStart } from '../src/format.ts';

const nowMs = Date.parse('2026-07-16T20:00:00.000Z');

test('time since start handles an event type without events', (): void => {
  assert.equal(formatTimeSinceStart(null, nowMs), 'No events yet');
});

test('time since start reports recent starts', (): void => {
  assert.equal(formatTimeSinceStart('2026-07-16T19:59:40.000Z', nowMs), 'just now');
  assert.equal(formatTimeSinceStart('2026-07-16T19:48:00.000Z', nowMs), '12m ago');
});

test('time since start includes useful subordinate units', (): void => {
  assert.equal(formatTimeSinceStart('2026-07-16T17:52:00.000Z', nowMs), '2h 8m ago');
  assert.equal(formatTimeSinceStart('2026-07-13T15:00:00.000Z', nowMs), '3d 5h ago');
});

test('future timestamps clamp to just now', (): void => {
  assert.equal(formatTimeSinceStart('2026-07-16T20:15:00.000Z', nowMs), 'just now');
});

test('invalid timestamps render a safe fallback', (): void => {
  assert.equal(formatTimeSinceStart('not-a-date', nowMs), 'Unknown');
});
