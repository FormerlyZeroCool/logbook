import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventUpdateRequest, buildLatestEventStartUpdate } from '../src/event-edit.ts';

function local(value: string): string {
  return new Date(value).toISOString();
}

test('point edits force identical start and end timestamps', (): void => {
  const request = buildEventUpdateRequest({
    eventKind: 'point',
    startedAtLocal: '2026-07-16T10:30',
    endedAtLocal: '2026-07-16T11:30',
    ongoing: false,
    valueText: '181',
    unitKey: 'lb',
    textValue: '',
    note: 'After breakfast'
  });

  assert.equal(request.startedAt, local('2026-07-16T10:30'));
  assert.equal(request.endedAt, request.startedAt);
  assert.equal(request.value, 181);
  assert.equal(request.unitKey, 'lb');
  assert.equal(request.note, 'After breakfast');
});

test('duration edits support start, end, and note changes', (): void => {
  const request = buildEventUpdateRequest({
    eventKind: 'duration',
    startedAtLocal: '2026-07-16T08:00',
    endedAtLocal: '2026-07-16T09:15',
    ongoing: false,
    valueText: '',
    unitKey: '',
    textValue: 'Morning walk',
    note: 'Rained near the end'
  });

  assert.equal(request.startedAt, local('2026-07-16T08:00'));
  assert.equal(request.endedAt, local('2026-07-16T09:15'));
  assert.equal(request.value, null);
  assert.equal(request.textValue, 'Morning walk');
  assert.equal(request.note, 'Rained near the end');
});

test('duration edits can clear the end time to make an event ongoing', (): void => {
  const request = buildEventUpdateRequest({
    eventKind: 'duration',
    startedAtLocal: '2026-07-16T08:00',
    endedAtLocal: '',
    ongoing: true,
    valueText: '',
    unitKey: '',
    textValue: '',
    note: ''
  });

  assert.equal(request.endedAt, null);
});

test('duration edits reject an end before the start', (): void => {
  assert.throws((): void => {
    buildEventUpdateRequest({
      eventKind: 'duration',
      startedAtLocal: '2026-07-16T10:00',
      endedAtLocal: '2026-07-16T09:00',
      ongoing: false,
      valueText: '',
      unitKey: '',
      textValue: '',
      note: ''
    });
  }, /End time must be at or after start time/);
});

test('latest point-event start updates produce an ISO timestamp', (): void => {
  const request = buildLatestEventStartUpdate(
    { eventKind: 'point', endedAt: '2026-07-16T14:00:00.000Z' },
    '2026-07-16T10:30'
  );
  assert.equal(request.startedAt, local('2026-07-16T10:30'));
});

test('latest duration-event start updates cannot move past the existing end', (): void => {
  assert.throws((): void => {
    buildLatestEventStartUpdate(
      { eventKind: 'duration', endedAt: local('2026-07-16T09:00') },
      '2026-07-16T10:00'
    );
  }, /Start time must be at or before the existing end time/);
});
