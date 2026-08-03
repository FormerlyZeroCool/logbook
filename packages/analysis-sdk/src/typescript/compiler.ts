import * as ts from 'typescript';
import type { AnalysisFunctionKind, SourceDiagnostic } from '../contracts.js';
import { ANALYSIS_SDK_DECLARATIONS } from './type-declarations.js';
import { analysisFunctionCollection, analysisFunctionPropertyIdentifier, buildFunctionSourceDocument, buildProgramSourceDocument } from './source-documents.js';

export type AnalysisSourceBinding = {
  alias: string;
  functionKey?: string;
  functionKind: AnalysisFunctionKind;
  sourceBody: string;
};

export type AnalysisCompilationResult = {
  javascript: string | null;
  diagnostics: SourceDiagnostic[];
  typescript: string;
};

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.None,
  lib: ['lib.es2023.d.ts'],
  types: [],
  strict: true,
  noImplicitAny: true,
  noImplicitReturns: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  useUnknownInCatchVariables: true,
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  skipLibCheck: true,
  noEmitOnError: false,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
  sourceMap: false,
};

function flattenMessage(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, '\n');
}

function toDiagnostic(diagnostic: ts.Diagnostic, sourceFileName: string): SourceDiagnostic {
  let line = 1;
  let column = 1;
  let endLine: number | undefined;
  let endColumn: number | undefined;
  if (diagnostic.file?.fileName === sourceFileName && diagnostic.start !== undefined) {
    const start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    line = start.line + 1;
    column = start.character + 1;
    if (diagnostic.length !== undefined) {
      const end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);
      endLine = end.line + 1;
      endColumn = end.character + 1;
    }
  }
  return {
    severity: diagnostic.category === ts.DiagnosticCategory.Warning || diagnostic.category === ts.DiagnosticCategory.Suggestion ? 'warning' : 'error',
    code: `typescript_${diagnostic.code}`,
    message: flattenMessage(diagnostic.messageText),
    line,
    column,
    ...(endLine === undefined ? {} : { endLine }),
    ...(endColumn === undefined ? {} : { endColumn }),
  };
}

function sourceBundle(sourceBody: string, inputAliases: readonly string[], bindings: readonly AnalysisSourceBinding[]): string {
  const functionSources = bindings.map((binding) => buildFunctionSourceDocument(binding.sourceBody, binding.functionKind, binding.alias).text).join('\n');
  const groups = {
    mappers: [] as string[],
    filters: [] as string[],
    reducers: [] as string[],
    window_transforms: [] as string[],
    map_filters: [] as string[],
    series_transforms: [] as string[],
  };
  for (const binding of bindings) {
    const functionKey = binding.functionKey ?? binding.alias;
    const propertyKey = analysisFunctionPropertyIdentifier(functionKey);
    groups[analysisFunctionCollection(binding.functionKind)].push(`${propertyKey}: ${binding.alias}`);
  }
  const collectionSource = (name: keyof typeof groups): string => `${name}: Object.freeze({${groups[name].join(',')}})`;
  const libraries = `const udf = Object.freeze({${[
    collectionSource('mappers'),
    collectionSource('filters'),
    collectionSource('reducers'),
    collectionSource('window_transforms'),
    collectionSource('map_filters'),
    collectionSource('series_transforms'),
  ].join(',')}});`;
  return `${functionSources}${functionSources ? '\n' : ''}${libraries}\n${buildProgramSourceDocument(sourceBody, inputAliases).text}`;
}

function transpile(source: string, fileName: string): AnalysisCompilationResult {
  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName,
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics ?? []).map((diagnostic) => toDiagnostic(diagnostic, fileName));
  return {
    javascript: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? null : result.outputText,
    diagnostics,
    typescript: source,
  };
}

function typeCheckAndEmit(source: string, fileName: string, declarationsName: string, declarations: string): AnalysisCompilationResult {
  const virtualFiles = new Map<string, string>([[fileName, source], [declarationsName, declarations]]);
  const baseHost = ts.createCompilerHost(compilerOptions, true);
  let javascript = '';
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (candidate) => virtualFiles.has(candidate) || baseHost.fileExists(candidate),
    readFile: (candidate) => virtualFiles.get(candidate) ?? baseHost.readFile(candidate),
    getSourceFile: (candidate, languageVersion, onError, shouldCreateNewSourceFile) => {
      const text = virtualFiles.get(candidate);
      return text === undefined ? baseHost.getSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile) : ts.createSourceFile(candidate, text, languageVersion, true, candidate.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TS);
    },
    writeFile: (name, text) => { if (name.endsWith('.js')) javascript = text; },
  };
  const program = ts.createProgram({ rootNames: [fileName, declarationsName], options: compilerOptions, host });
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => toDiagnostic(diagnostic, fileName));
  program.emit();
  return {
    javascript: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? null : javascript,
    diagnostics,
    typescript: source,
  };
}

export function compileAnalysisProgram(input: {
  sourceBody: string;
  inputAliases: readonly string[];
  functionBindings?: readonly AnalysisSourceBinding[];
  semantic?: boolean;
}): AnalysisCompilationResult {
  const bindings = input.functionBindings ?? [];
  const source = sourceBundle(input.sourceBody, input.inputAliases, bindings);
  const declarations = ANALYSIS_SDK_DECLARATIONS;
  const fileName = '/logbook-analysis-program.ts';
  return input.semantic === false
    ? transpile(source, fileName)
    : typeCheckAndEmit(source, fileName, '/logbook-analysis-sdk.d.ts', declarations);
}
