import {
  buildFunctionSourceDocument,
  buildProgramSourceDocument,
  extractAnalysisBody,
  generateFunctionBindingDeclarations,
  type AnalysisFunctionKind,
  type AnalysisSourceDocument,
} from '@logbook/analysis-sdk';
import type {
  AnalysisEditorDocumentAdapter,
  AnalysisEditorFunctionBinding,
  AnalysisEditorLineRange,
  AnalysisEditorSourceDocument,
} from './types.js';

function udfDeclarationRange(declarations: string): AnalysisEditorLineRange | null {
  const lines = declarations.trim().split('\n');
  const startOffset = lines.findIndex((line) => line.startsWith('const udf = Object.freeze({'));
  if (startOffset < 0) return null;
  // generateFunctionBindingDeclarations always emits the udf declaration last.
  return {
    startLineNumber: 2 + startOffset,
    endLineNumber: 2 + lines.length - 1,
  };
}

function prependGeneratedModuleScope(
  document: AnalysisSourceDocument,
  declarations = '',
): AnalysisEditorSourceDocument {
  const sections = ['export {};', declarations.trim()].filter(Boolean);
  const generatedPrefix = `${sections.join('\n')}\n\n`;
  const addedLines = generatedPrefix.split('\n').length - 1;
  const hiddenUdfRange = declarations ? udfDeclarationRange(declarations) : null;
  return {
    ...document,
    text: `${generatedPrefix}${document.text}`,
    prefix: `${generatedPrefix}${document.prefix}`,
    bodyStartLine: document.bodyStartLine + addedLines,
    bodyEndLine: document.bodyEndLine + addedLines,
    ...(hiddenUdfRange ? { hiddenGeneratedRanges: [hiddenUdfRange] } : {}),
  };
}

export function createProgramEditorDocument(options: {
  inputAliases: readonly string[];
  functionBindings?: readonly AnalysisEditorFunctionBinding[];
}): AnalysisEditorDocumentAdapter {
  const bindings = options.functionBindings ?? [];
  const bindingDeclarations = generateFunctionBindingDeclarations(bindings);

  return {
    key: `program:${options.inputAliases.join(',')}:${bindings.map((binding) => `${binding.functionKey ?? binding.alias}:${binding.alias}:${binding.functionKind}`).join(',')}`,
    build: (sourceBody) => prependGeneratedModuleScope(
      buildProgramSourceDocument(sourceBody, options.inputAliases),
      bindingDeclarations,
    ),
    extract: extractAnalysisBody,
    generatedRegionMessage: 'Generated module scope, selected analysis inputs, reusable-function bindings, and runtime contract.',
  };
}

export function createFunctionEditorDocument(options: {
  functionKind: AnalysisFunctionKind;
  functionAlias: string;
}): AnalysisEditorDocumentAdapter {
  return {
    key: `function:${options.functionKind}:${options.functionAlias}`,
    build: (sourceBody) => prependGeneratedModuleScope(
      buildFunctionSourceDocument(sourceBody, options.functionKind, options.functionAlias),
    ),
    extract: extractAnalysisBody,
    generatedRegionMessage: 'Generated module scope and reusable-function runtime contract.',
  };
}
