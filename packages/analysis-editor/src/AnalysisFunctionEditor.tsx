import { useMemo } from 'react';
import type { AnalysisFunctionKind } from '@logbook/analysis-sdk';
import { AnalysisTypeScriptEditor } from './AnalysisTypeScriptEditor.js';
import { createFunctionEditorDocument } from './document-adapters.js';
import type { AnalysisTypeScriptEditorProps } from './types.js';

export type AnalysisFunctionEditorProps = Omit<AnalysisTypeScriptEditorProps, 'document'> & {
  functionKind: AnalysisFunctionKind;
  functionAlias: string;
};

export function AnalysisFunctionEditor({ functionKind, functionAlias, ...editorProps }: AnalysisFunctionEditorProps) {
  const document = useMemo(
    () => createFunctionEditorDocument({ functionKind, functionAlias }),
    [functionKind, functionAlias],
  );
  return <AnalysisTypeScriptEditor {...editorProps} document={document} />;
}
