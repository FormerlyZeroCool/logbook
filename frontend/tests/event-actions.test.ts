import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { buildFinishEventRequest } from '../src/event-actions.ts';

test('finish event request sends the browser finish timestamp', (context: TestContext): void => {
  void context;
  const request = buildFinishEventRequest(
    '0d4f066e-0309-43d7-b85e-08cc1507c706',
    new Date('2026-07-15T21:30:45.123Z')
  );

  assert.deepEqual(request, {
    eventId: '0d4f066e-0309-43d7-b85e-08cc1507c706',
    endedAt: '2026-07-15T21:30:45.123Z'
  });
});

test('finish event request rejects an empty event id', (context: TestContext): void => {
  void context;
  assert.throws((): void => {
    buildFinishEventRequest('   ', new Date('2026-07-15T21:30:45.123Z'));
  }, /eventId is required/);
});
