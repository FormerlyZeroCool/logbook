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
} from './types.js';

function prependGeneratedModuleScope(document: AnalysisSourceDocument, declarations = ''): AnalysisSourceDocument {
  const sections = ['export {};', declarations.trim()].filter(Boolean);
  const generatedPrefix = `${sections.join('\n')}\n\n`;
  const addedLines = generatedPrefix.split('\n').length - 1;
  return {
    ...document,
    text: `${generatedPrefix}${document.text}`,
    prefix: `${generatedPrefix}${document.prefix}`,
    bodyStartLine: document.bodyStartLine + addedLines,
    bodyEndLine: document.bodyEndLine + addedLines,
  };
}

export function createProgramEditorDocument(options: {
  inputAliases: readonly string[];
  functionBindings?: readonly AnalysisEditorFunctionBinding[];
}): AnalysisEditorDocumentAdapter {
  const bindings = options.functionBindings ?? [];
  const bindingDeclarations = generateFunctionBindingDeclarations(bindings);

  return {
    key: `program:${options.inputAliases.join(',')}:${bindings.map((binding) => `${binding.alias}:${binding.functionKind}`).join(',')}`,
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
