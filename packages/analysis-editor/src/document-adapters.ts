import {
  buildProgramSourceDocument,
  createAnalysisFunctionTemplate,
  extractAnalysisBody,
  generateFunctionBindingDeclarations,
  isCompleteAnalysisFunctionSource,
  type AnalysisFunctionKind,
  type AnalysisSourceDocument,
} from '@logbook/analysis-sdk';
import type {
  AnalysisEditorDocumentAdapter,
  AnalysisEditorFunctionBinding,
} from './types.js';

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function editableFunctionDocument(
  source: string,
  fallbackKind: AnalysisFunctionKind,
  functionAlias: string,
): AnalysisSourceDocument {
  const functionSource = isCompleteAnalysisFunctionSource(source)
    ? source.trim()
    : createAnalysisFunctionTemplate(fallbackKind, functionAlias).trim();
  const text = `${functionSource}\n`;
  return {
    text,
    bodyStartLine: 1,
    bodyEndLine: Math.max(1, text.split('\n').length - 1),
    prefix: '',
    suffix: '',
  };
}

function extractEditableFunctionSource(sourceText: string): string | null {
  const functionStart = sourceText.search(/^function\s+/m);
  if (functionStart < 0) return null;
  const source = sourceText.slice(functionStart).trim();
  return isCompleteAnalysisFunctionSource(source) ? source : null;
}

export function createProgramEditorDocument(options: {
  inputAliases: readonly string[];
  functionBindings?: readonly AnalysisEditorFunctionBinding[];
}): AnalysisEditorDocumentAdapter {
  const bindings = options.functionBindings ?? [];
  const bindingIdentity = bindings
    .map((binding) => `${binding.functionKey ?? binding.alias}:${binding.alias}:${binding.functionKind}:${stableHash(binding.sourceBody ?? '')}`)
    .join(',');
  const declarations = generateFunctionBindingDeclarations(bindings);
  const declarationHash = stableHash(declarations);

  return {
    // Version the adapter and declaration hash so Monaco cannot reuse a stale v6/v9 model.
    key: `program-v15:${options.inputAliases.join(',')}:${bindingIdentity}:${declarationHash}`,
    build: (sourceBody) => buildProgramSourceDocument(sourceBody, options.inputAliases),
    extract: extractAnalysisBody,
    extraLibraries: [{
      uri: `file:///logbook-analysis/generated/udf-${declarationHash}.d.ts`,
      content: declarations,
    }],
    generatedDeclarations: declarations,
    generatedRegionMessage: 'Generated transform signature and runtime contract. Reusable-function declarations are loaded as a hidden TypeScript library.',
  };
}

export function createFunctionEditorDocument(options: {
  functionKind: AnalysisFunctionKind;
  functionAlias: string;
}): AnalysisEditorDocumentAdapter {
  return {
    key: `function-signature-v15:${options.functionAlias}`,
    build: (sourceBody) => editableFunctionDocument(sourceBody, options.functionKind, options.functionAlias),
    extract: extractEditableFunctionSource,
    generatedRegionMessage: 'The function signature and body are persisted and determine the inferred UDF category.',
  };
}
