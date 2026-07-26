import type { AnalysisFunctionKind, AnalysisSourceDocument, SourceDiagnostic } from '@logbook/analysis-sdk';

export type AnalysisEditorFunctionBinding = {
  alias: string;
  functionKind: AnalysisFunctionKind;
};

export type AnalysisEditorExtraLibrary = {
  uri: string;
  content: string;
};

export type AnalysisEditorDocumentAdapter = {
  key: string;
  build(sourceBody: string): AnalysisSourceDocument;
  extract(sourceText: string): string | null;
  extraLibraries?: readonly AnalysisEditorExtraLibrary[];
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
