import { formatDuration } from './format';
import type { UnitDefinition } from './types';
import { formatMeasuredValue } from './units';

export type EventTooltipSource = {
  value: number | null;
  textValue: string | null;
  note: string | null;
  durationSeconds: number | null;
  ongoing: boolean;
};

export type EventTooltipRow = {
  label: string;
  value: string;
  multiline?: boolean;
};

function presentText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatUnitlessValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

export function buildEventTooltipRows(
  event: EventTooltipSource,
  unit: UnitDefinition | null
): EventTooltipRow[] {
  const rows: EventTooltipRow[] = [];
  if (event.value !== null && Number.isFinite(event.value)) {
    rows.push({
      label: 'Value',
      value: unit ? formatMeasuredValue(event.value, unit) : formatUnitlessValue(event.value)
    });
  }

  const text = presentText(event.textValue);
  if (text) rows.push({ label: 'Text', value: text, multiline: true });

  const note = presentText(event.note);
  if (note) rows.push({ label: 'Note', value: note, multiline: true });

  const duration = formatDuration(event.durationSeconds);
  rows.push({
    label: 'Duration',
    value: `${duration}${event.ongoing ? ' (ongoing)' : ''}`
  });

  return rows;
}
