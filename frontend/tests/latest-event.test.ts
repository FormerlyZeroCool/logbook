import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLatestEvent } from '../src/latest-event.ts';

test('latest-event selection tolerates an omitted recentEvents field', (): void => {
  assert.equal(selectLatestEvent(undefined, undefined, ['listed']), 'listed');
});

test('latest-event selection prefers the dedicated latest response', (): void => {
  assert.equal(selectLatestEvent('latest', ['recent'], ['listed']), 'latest');
});

test('latest-event selection falls back to the summary before the list', (): void => {
  assert.equal(selectLatestEvent(undefined, ['recent'], ['listed']), 'recent');
});

test('latest-event selection returns null when the event type has no events', (): void => {
  assert.equal(selectLatestEvent(undefined, undefined, undefined), null);
  assert.equal(selectLatestEvent(undefined, [], []), null);
});
