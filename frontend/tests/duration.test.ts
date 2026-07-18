import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { getDisplayDurationSeconds, type DurationLike } from '../src/duration.ts';

const startedAt = '2026-07-15T20:00:00.000Z';
const nowMs = Date.parse('2026-07-15T20:10:00.000Z');

test('ongoing duration is calculated as now minus start', (context: TestContext): void => {
  void context;
  const event: DurationLike = {
    startedAt,
    endedAt: null,
    durationSeconds: -99_999,
    ongoing: true
  };
  assert.equal(getDisplayDurationSeconds(event, nowMs), 600);
});

test('ongoing future timestamps clamp to zero', (context: TestContext): void => {
  void context;
  const event: DurationLike = {
    startedAt: '2026-07-15T20:20:00.000Z',
    endedAt: null,
    durationSeconds: null,
    ongoing: true
  };
  assert.equal(getDisplayDurationSeconds(event, nowMs), 0);
});

test('completed events use their stored duration', (context: TestContext): void => {
  void context;
  const event: DurationLike = {
    startedAt,
    endedAt: '2026-07-15T20:05:00.000Z',
    durationSeconds: 300,
    ongoing: false
  };
  assert.equal(getDisplayDurationSeconds(event, nowMs), 300);
});

test('negative completed durations clamp to zero', (context: TestContext): void => {
  void context;
  const event: DurationLike = {
    startedAt,
    endedAt: '2026-07-15T20:05:00.000Z',
    durationSeconds: -300,
    ongoing: false
  };
  assert.equal(getDisplayDurationSeconds(event, nowMs), 0);
});

test('completed events can fall back to end minus start', (context: TestContext): void => {
  void context;
  const event: DurationLike = {
    startedAt,
    endedAt: '2026-07-15T20:07:30.000Z',
    durationSeconds: null,
    ongoing: false
  };
  assert.equal(getDisplayDurationSeconds(event, nowMs), 450);
});
