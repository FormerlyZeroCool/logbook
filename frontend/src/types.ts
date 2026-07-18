export type EventKind = 'point' | 'duration';

export type UnitDefinition = {
  id: string;
  key: string;
  name: string;
  symbol: string;
  scaleToBase: number;
  offsetToBase: number;
  aliases: string[];
  isBase: boolean;
  eventCount: number;
  defaultEventTypeCount: number;
};

export type UnitTypeDefinition = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  baseUnit: UnitDefinition | null;
  units: UnitDefinition[];
  eventTypeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type UnitTypeReference = {
  id: string;
  key: string;
  name: string;
};

export type LogEvent = {
  id: string;
  eventTypeId: string;
  eventType: string;
  eventTypeName: string;
  eventKind: EventKind;
  unitType: UnitTypeReference | null;
  canonicalUnit: UnitDefinition | null;
  defaultUnit: UnitDefinition | null;
  unit: string | null;
  value: number | null;
  canonicalValue: number | null;
  displayValue: number | null;
  inputValue: number | null;
  inputUnit: UnitDefinition | null;
  startedAt: string;
  endedAt: string | null;
  textValue: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  durationSeconds: number | null;
  ongoing: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type PaginatedEvents = {
  events: LogEvent[];
  pagination: EventPagination;
};

export type EventTypeSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  unitType: UnitTypeReference | null;
  baseUnit: UnitDefinition | null;
  defaultUnit: UnitDefinition | null;
  unit: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  archivedAt: string | null;
  totalEvents: number;
  pointEvents: number;
  durationEvents: number;
  numericEvents: number;
  ongoingEvents: number;
  latestStartedAt: string | null;
  latestEndedAt: string | null;
  recentEvents?: LogEvent[];
  createdAt: string;
  updatedAt: string;
};

export type SeriesPoint = {
  bucket: string;
  eventCount: number;
  valueAvg: number | null;
  valueMin: number | null;
  valueMax: number | null;
  valueSum: number | null;
  durationAvgSeconds: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  durationSumSeconds: number | null;
};

export type ValueSeriesPoint = {
  eventId: string;
  eventKind: EventKind;
  at: string;
  endedAt: string | null;
  value: number;
  canonicalValue: number;
  textValue: string | null;
  note: string | null;
  durationSeconds: number;
  ongoing: boolean;
};

export type DurationSeriesPoint = {
  eventId: string;
  eventKind: EventKind;
  startedAt: string;
  endedAt: string | null;
  value: number | null;
  canonicalValue: number | null;
  textValue: string | null;
  note: string | null;
  durationSeconds: number;
  ongoing: boolean;
};

export type SeriesResponse = {
  eventType: {
    key: string;
    name: string;
    unitType: UnitTypeReference | null;
    baseUnit: UnitDefinition | null;
    defaultUnit: UnitDefinition | null;
    displayUnit: UnitDefinition | null;
    unit: string | null;
  };
  from: string;
  to: string;
  bucket: string;
  timeZone: string;
  points: SeriesPoint[];
  valuePoints: ValueSeriesPoint[];
  durationPoints: DurationSeriesPoint[];
};
