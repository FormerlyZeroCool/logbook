import type { EventKind } from './types';
export type EventUpdateRequest = {
  startedAt: string;
  endedAt: string | null;
  value: number | null;
  unitKey?: string;
  textValue: string | null;
  note: string | null;
};

export type EventEditValues = {
  eventKind: EventKind;
  startedAtLocal: string;
  endedAtLocal: string;
  ongoing: boolean;
  valueText: string;
  unitKey: string;
  textValue: string;
  note: string;
};

export type LatestEventStartUpdateRequest = {
  startedAt: string;
};

function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function buildEventUpdateRequest(values: EventEditValues): EventUpdateRequest {
  const startedAtLocal = values.startedAtLocal.trim();
  if (!startedAtLocal) throw new Error('Start time is required');

  const startedAt = localInputToIso(startedAtLocal);
  let endedAt: string | null;

  if (values.eventKind === 'point') {
    endedAt = startedAt;
  } else if (values.ongoing) {
    endedAt = null;
  } else {
    const endedAtLocal = values.endedAtLocal.trim();
    if (!endedAtLocal) throw new Error('End time is required unless the event is ongoing');
    endedAt = localInputToIso(endedAtLocal);
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new Error('End time must be at or after start time');
    }
  }

  const valueText = values.valueText.trim();
  const value = valueText === '' ? null : Number(valueText);
  if (value !== null && !Number.isFinite(value)) throw new Error('Value must be a finite number');

  return {
    startedAt,
    endedAt,
    value,
    ...(value !== null && values.unitKey ? { unitKey: values.unitKey } : {}),
    textValue: values.textValue.trim() || null,
    note: values.note.trim() || null
  };
}

export function buildLatestEventStartUpdate(
  event: { eventKind: EventKind; endedAt: string | null },
  startedAtLocal: string
): LatestEventStartUpdateRequest {
  const trimmed = startedAtLocal.trim();
  if (!trimmed) throw new Error('Start time is required');

  const startedAt = localInputToIso(trimmed);
  if (event.eventKind === 'duration' && event.endedAt !== null
    && Date.parse(startedAt) > Date.parse(event.endedAt)) {
    throw new Error('Start time must be at or before the existing end time');
  }

  return { startedAt };
}
