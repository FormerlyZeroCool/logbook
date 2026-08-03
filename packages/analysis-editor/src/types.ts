import type { AnalysisFunctionKind, AnalysisSourceDocument, SourceDiagnostic } from '@logbook/analysis-sdk';

export type AnalysisEditorFunctionBinding = {
  alias: string;
  functionKey?: string;
  functionKind: AnalysisFunctionKind;
  /** Full saved source preserves typed factory parameters in Monaco declarations. */
  sourceBody?: string;
};

export type AnalysisEditorExtraLibrary = {
  uri: string;
  content: string;
};

export type AnalysisEditorSourceDocument = AnalysisSourceDocument;

export type AnalysisEditorDocumentAdapter = {
  key: string;
  build(sourceBody: string): AnalysisEditorSourceDocument;
  extract(sourceText: string): string | null;
  extraLibraries?: readonly AnalysisEditorExtraLibrary[];
  /** Read-only generated declarations available through the optional disclosure UI. */
  generatedDeclarations?: string;
  generatedRegionMessage?: string;
};

export type AnalysisTypeScriptEditorProps = {
  sourceBody: string;
  onSourceBodyChange: (sourceBody: string) => void;
  document: AnalysisEditorDocumentAdapter;
  diagnostics?: readonly SourceDiagnostic[];
  onTypeDiagnosticsChange?: (diagnostics: SourceDiagnostic[]) => void;
  readOnly?: boolean;
  modelKey?: string;
  height?: number | string;
  theme?: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  onSaveShortcut?: () => void;
  onRunShortcut?: () => void;
  toolbarLabel?: string;
  className?: string;
};
