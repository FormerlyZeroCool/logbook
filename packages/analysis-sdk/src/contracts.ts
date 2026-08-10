export const ANALYSIS_SCHEMA_VERSION = 1 as const;
export const ANALYSIS_SDK_VERSION = 1 as const;
export const PIPELINE_REGISTRY_VERSION = 1 as const;

export type AnalysisFunctionKind =
  | 'event-filter'
  | 'point-map'
  | 'point-filter'
  | 'map-filter'
  | 'window-transform'
  | 'reducer'
  | 'series-transform';

export type UnitDescriptor = {
  key: string;
  symbol: string;
  dimensionKey: string;
};

export type AnalysisEventDto = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  displayValue: number | null;
  textValue: string | null;
  note: string | null;
  ongoing: boolean;
  inRequestedRange: boolean;
  calendarBucketStarts?: { day: string; week: string };
};

export type AnalysisInputDto = {
  key: string;
  label: string;
  unit: UnitDescriptor | null;
  events: AnalysisEventDto[];
};

export interface AnalysisQueryRequestV1 {
  schemaVersion: 1;
  from: string;
  to: string;
  timeZone: string;
  inputs: Array<{
    alias: string;
    eventTypeKey: string;
    displayUnitKey?: string;
    rowsBefore?: number;
    rowsAfter?: number;
    includeOngoing?: boolean;
  }>;
}

export interface AnalysisQueryResponseV1 {
  schemaVersion: 1;
  context: { from: string; to: string; now: string; timeZone: string };
  inputs: Record<string, AnalysisInputDto>;
}

export type AnalysisLimits = {
  timeoutMs: number;
  memoryBytes: number;
  stackBytes: number;
  maxInputEvents: number;
  maxOutputPoints: number;
  maxOutputSeries: number;
  maxLogs: number;
  maxSerializedBytes: number;
  workerPoolSize: number;
};

export type SerializedNumericPoint = {
  time: string;
  timeMs: number;
  value: number | null;
  eventId: string | null;
  note: string | null;
  textValue: string | null;
  startedAt: string | null;
  endedAt: string | null;
  inRequestedRange: boolean;
};

export type SerializedSeries = {
  kind: 'series';
  key: string | null;
  label: string;
  unit: UnitDescriptor | null;
  points: SerializedNumericPoint[];
};

export type SerializedScalar = {
  kind: 'scalar';
  value: number | string | null;
  label: string | null;
  unit: UnitDescriptor | null;
  description: string | null;
};

export type SerializedSeriesSet = {
  kind: 'series-set';
  title: string | null;
  series: SerializedSeries[];
};

export type SerializedAnalysisResult = SerializedScalar | SerializedSeries | SerializedSeriesSet;

export interface SourceDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface AnalysisValidationReport {
  schemaVersion: 1;
  sourceHash: string;
  sdkVersion: number;
  pipelineRegistryVersion: number;
  timeoutMs: number;
  status: 'passed' | 'failed' | 'syntax-error';
  syntaxDiagnostics: SourceDiagnostic[];
  fixtures: Array<{
    key: string;
    status: 'passed' | 'failed' | 'warning';
    durationMs: number;
    inputPointCount: number;
    outputPointCount: number;
    diagnostics: SourceDiagnostic[];
  }>;
  validatedAt: string;
}

export type PipelineValueType = 'EventSeries' | 'NumericSeries' | 'ScalarValue' | 'SeriesSet';

export type PipelineStep = {
  operation: string;
  arguments?: unknown[];
  functionBinding?: string;
  options?: Record<string, unknown>;
  windowSize?: number;
};

export type PipelineDefinitionV1 = {
  schemaVersion: 1;
  inputAlias: string;
  steps: PipelineStep[];
  outputType: PipelineValueType;
  queryContext: {
    mode: 'derived' | 'explicit-or-derived';
    rowsBefore: number;
    rowsAfter: number;
    exact: boolean;
  };
};
