import { useMemo } from 'react';
import { AnalysisTypeScriptEditor } from './AnalysisTypeScriptEditor.js';
import { createProgramEditorDocument } from './document-adapters.js';
import type { AnalysisEditorFunctionBinding, AnalysisTypeScriptEditorProps } from './types.js';

export type AnalysisProgramEditorProps = Omit<AnalysisTypeScriptEditorProps, 'document'> & {
  inputAliases?: readonly string[];
  functionBindings?: readonly AnalysisEditorFunctionBinding[];
};

export function AnalysisProgramEditor({
  inputAliases = ['event'],
  functionBindings = [],
  ...editorProps
}: AnalysisProgramEditorProps) {
  const inputKey = inputAliases.join('\u0000');
  const bindingKey = functionBindings
    .map((binding) => `${binding.functionKey ?? binding.alias}:${binding.alias}:${binding.functionKind}:${binding.sourceBody ?? ''}`)
    .join('\u0000');
  const document = useMemo(
    () => createProgramEditorDocument({ inputAliases, functionBindings }),
    [inputKey, bindingKey],
  );
  return <AnalysisTypeScriptEditor {...editorProps} document={document} />;
}
