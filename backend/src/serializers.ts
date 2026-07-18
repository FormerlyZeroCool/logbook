export type UnitRow = {
  id: string;
  unit_type_id: string;
  key: string;
  name: string;
  symbol: string;
  scale_to_base: number;
  offset_to_base: number;
  aliases?: string[];
  is_base: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
};

export type UnitTypeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type EventRow = {
  id: string;
  event_type_id: string;
  event_type: string;
  event_type_name: string;
  event_kind: 'point' | 'duration';
  unit_type_id: string | null;
  unit_type_key: string | null;
  unit_type_name: string | null;
  base_unit_id: string | null;
  base_unit_key: string | null;
  base_unit_name: string | null;
  base_unit_symbol: string | null;
  base_unit_scale_to_base: number | null;
  base_unit_offset_to_base: number | null;
  default_unit_id: string | null;
  default_unit_key: string | null;
  default_unit_name: string | null;
  default_unit_symbol: string | null;
  default_unit_scale_to_base: number | null;
  default_unit_offset_to_base: number | null;
  input_value: number | null;
  input_unit_id: string | null;
  input_unit_key: string | null;
  input_unit_name: string | null;
  input_unit_symbol: string | null;
  input_unit_scale_to_base: number | null;
  input_unit_offset_to_base: number | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  value: number | null;
  text_value: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  duration_seconds: number | null;
  live_duration_seconds?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type EventTypeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  unit_type_id: string | null;
  unit_type_key: string | null;
  unit_type_name: string | null;
  base_unit_id: string | null;
  base_unit_key: string | null;
  base_unit_name: string | null;
  base_unit_symbol: string | null;
  base_unit_scale_to_base: number | null;
  base_unit_offset_to_base: number | null;
  default_unit_id: string | null;
  default_unit_key: string | null;
  default_unit_name: string | null;
  default_unit_symbol: string | null;
  default_unit_scale_to_base: number | null;
  default_unit_offset_to_base: number | null;
  icon: string | null;
  color: string | null;
  voice_aliases?: string[];
  is_active: boolean;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_events?: number;
  point_events?: number;
  duration_events?: number;
  numeric_events?: number;
  ongoing_events?: number;
  latest_started_at?: Date | string | null;
  latest_ended_at?: Date | string | null;
};

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function unitFromColumns(row: Record<string, unknown>, prefix: string) {
  const id = row[`${prefix}_unit_id`] as string | null | undefined;
  if (!id) return null;
  return {
    id,
    key: row[`${prefix}_unit_key`] as string,
    name: row[`${prefix}_unit_name`] as string,
    symbol: row[`${prefix}_unit_symbol`] as string,
    scaleToBase: Number(row[`${prefix}_unit_scale_to_base`]),
    offsetToBase: Number(row[`${prefix}_unit_offset_to_base`]),
    aliases: [],
    isBase: prefix === 'base'
  };
}

export function serializeUnit(row: UnitRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    symbol: row.symbol,
    scaleToBase: Number(row.scale_to_base),
    offsetToBase: Number(row.offset_to_base),
    aliases: row.aliases ?? [],
    isBase: row.is_base
  };
}

export function serializeEvent(row: EventRow) {
  const baseUnit = unitFromColumns(row as unknown as Record<string, unknown>, 'base');
  const defaultUnit = unitFromColumns(row as unknown as Record<string, unknown>, 'default');
  const inputUnit = unitFromColumns(row as unknown as Record<string, unknown>, 'input');
  const canonicalValue = row.value;
  const displayValue = canonicalValue === null || !defaultUnit
    ? canonicalValue
    : (canonicalValue - defaultUnit.offsetToBase) / defaultUnit.scaleToBase;

  return {
    id: row.id,
    eventTypeId: row.event_type_id,
    eventType: row.event_type,
    eventTypeName: row.event_type_name,
    eventKind: row.event_kind,
    unitType: row.unit_type_id ? {
      id: row.unit_type_id,
      key: row.unit_type_key,
      name: row.unit_type_name
    } : null,
    canonicalUnit: baseUnit,
    defaultUnit,
    unit: defaultUnit?.symbol ?? null,
    value: canonicalValue,
    canonicalValue,
    displayValue,
    inputValue: row.input_value,
    inputUnit,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    textValue: row.text_value,
    note: row.note,
    metadata: row.metadata ?? {},
    durationSeconds: row.duration_seconds ?? row.live_duration_seconds ?? null,
    ongoing: row.ended_at === null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export function serializeEventType(row: EventTypeRow) {
  const baseUnit = unitFromColumns(row as unknown as Record<string, unknown>, 'base');
  const defaultUnit = unitFromColumns(row as unknown as Record<string, unknown>, 'default');
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    unitType: row.unit_type_id ? {
      id: row.unit_type_id,
      key: row.unit_type_key,
      name: row.unit_type_name
    } : null,
    baseUnit,
    defaultUnit,
    unit: defaultUnit?.symbol ?? null,
    icon: row.icon,
    color: row.color,
    voiceAliases: row.voice_aliases ?? [],
    isActive: row.is_active,
    archivedAt: iso(row.archived_at),
    totalEvents: row.total_events ?? 0,
    pointEvents: row.point_events ?? 0,
    durationEvents: row.duration_events ?? 0,
    numericEvents: row.numeric_events ?? 0,
    ongoingEvents: row.ongoing_events ?? 0,
    latestStartedAt: iso(row.latest_started_at),
    latestEndedAt: iso(row.latest_ended_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}
