import type { AnalysisFunctionKind, PipelineDefinitionV1, SourceDiagnostic } from '@logbook/analysis-sdk';
import type { ExploreInput } from './editor/InputEditor';

export type ExploreSessionOrigin =
  | { kind: 'standalone' }
  | {
      kind: 'chart';
      chartId: string;
      chartTitle: string;
      eventTypeKey: string;
      returnPath: string;
      originalProgramRevisionId: string;
      visualization: Record<string, unknown>;
    };

export type SessionFunctionDraft = {
  id: string;
  functionKey: string;
  name: string;
  description: string;
  functionKind: AnalysisFunctionKind;
  sourceBody: string;
  diagnostics: SourceDiagnostic[];
  libraryFunctionId?: string;
  libraryRevisionId?: string;
  libraryPublished?: boolean;
  librarySourceBody?: string;
};

export type ExploreWorkspaceStateV1 = {
  schemaVersion: 1;
  name: string;
  description: string;
  mode: 'pipeline' | 'code';
  autoRun: boolean;
  rangeMode: 'rolling' | 'fixed';
  fixedRange: { from: string; to: string };
  inputs: ExploreInput[];
  pipeline: PipelineDefinitionV1;
  code: string;
  localFunctions: SessionFunctionDraft[];
  selectedLocalFunctionId: string | null;
};

export type ExploreEditorPreferencesV1 = {
  schemaVersion: 1;
  origin: ExploreSessionOrigin;
  workspace?: ExploreWorkspaceStateV1;
};

export function isExploreEditorPreferences(value: unknown): value is ExploreEditorPreferencesV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExploreEditorPreferencesV1>;
  return candidate.schemaVersion === 1
    && Boolean(candidate.origin && typeof candidate.origin === 'object')
    && (candidate.workspace === undefined || Boolean(candidate.workspace && typeof candidate.workspace === 'object'));
}
