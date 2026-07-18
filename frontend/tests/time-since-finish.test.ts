import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimeSinceFinish } from '../src/format.ts';

const nowMs = Date.parse('2026-07-16T20:00:00.000Z');

test('time since finish handles an event type without a completed event', (): void => {
  assert.equal(formatTimeSinceFinish(null, nowMs), 'No finished events yet');
});

test('time since finish reports the latest completed timestamp', (): void => {
  assert.equal(formatTimeSinceFinish('2026-07-16T19:59:40.000Z', nowMs), 'just now');
  assert.equal(formatTimeSinceFinish('2026-07-16T17:52:00.000Z', nowMs), '2h 8m ago');
});

test('time since finish safely handles invalid and future timestamps', (): void => {
  assert.equal(formatTimeSinceFinish('not-a-date', nowMs), 'Unknown');
  assert.equal(formatTimeSinceFinish('2026-07-16T20:15:00.000Z', nowMs), 'just now');
});
