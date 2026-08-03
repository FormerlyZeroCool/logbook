import * as ts from 'typescript';
import type { AnalysisFunctionKind } from '../contracts.js';

export type InferredAnalysisFunction = {
  functionKind: AnalysisFunctionKind;
  functionName: string | null;
};

function compact(node: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  return node?.getText(sourceFile).replace(/\s+/g, '') ?? '';
}

function isNumberOrNull(type: string): boolean {
  return type === 'number' || type === 'number|null' || type === 'null|number';
}

function isReducerResult(type: string): boolean {
  const members = type.split('|').filter(Boolean);
  if (members.length === 0) return false;
  const allowed = new Set(['number', 'string', 'null']);
  return members.every((member) => allowed.has(member))
    && members.some((member) => member === 'number' || member === 'string');
}

function isNumericPointOrNull(type: string): boolean {
  return type === 'NumericPoint|null' || type === 'null|NumericPoint';
}

function isNullableNumberArray(type: string): boolean {
  return type === 'readonly(number|null)[]'
    || type === 'readonly(null|number)[]'
    || type === 'ReadonlyArray<number|null>'
    || type === 'ReadonlyArray<null|number>';
}

function isNumericPointArray(type: string): boolean {
  return type === 'readonlyNumericPoint[]' || type === 'ReadonlyArray<NumericPoint>';
}

function hasTrailingContext(parameters: readonly string[], offset: number): boolean {
  return parameters[offset] === 'AnalysisOptions' && parameters[offset + 1] === 'AnalysisContext';
}

function inferDeclarationKind(declaration: ts.FunctionDeclaration, sourceFile: ts.SourceFile): AnalysisFunctionKind | null {
  const parameters = declaration.parameters.map((parameter) => compact(parameter.type, sourceFile));
  const returnType = compact(declaration.type, sourceFile);

  if (
    parameters.length === 5
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasTrailingContext(parameters, 3)
    && returnType === 'NumericPoint'
  ) return 'point-map';

  // Backward compatibility for revisions saved before map inferred point returns.
  if (
    parameters.length === 4
    && parameters[0] === 'NumericPoint'
    && parameters[1] === 'number'
    && hasTrailingContext(parameters, 2)
    && returnType === 'NumericPoint'
  ) return 'point-map';

  if (
    parameters.length === 4
    && parameters[0] === 'NumericWindow'
    && parameters[1] === 'number'
    && hasTrailingContext(parameters, 2)
    && returnType === 'NumericPoint'
  ) return 'window-transform';

  if (
    parameters.length === 5
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasTrailingContext(parameters, 3)
    && returnType === 'boolean'
  ) return 'point-filter';

  if (
    parameters.length === 4
    && parameters[0] === 'EventRecord'
    && parameters[1] === 'number'
    && hasTrailingContext(parameters, 2)
    && returnType === 'boolean'
  ) return 'event-filter';

  if (
    parameters.length === 4
    && isNullableNumberArray(parameters[0] ?? '')
    && isNumericPointArray(parameters[1] ?? '')
    && hasTrailingContext(parameters, 2)
    && isReducerResult(returnType)
  ) return 'reducer';

  if (
    parameters.length === 5
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasTrailingContext(parameters, 3)
    && (isNumericPointOrNull(returnType) || returnType === 'MapFilterResult')
  ) return 'map-filter';

  if (
    parameters.length === 3
    && parameters[0] === 'NumericSeries'
    && hasTrailingContext(parameters, 1)
    && ['AnalysisResult', 'NumericSeries', 'SeriesSet', 'ScalarValue'].includes(returnType)
  ) return 'series-transform';

  return null;
}

export function findAnalysisFunctionDeclaration(source: string): {
  sourceFile: ts.SourceFile;
  declaration: ts.FunctionDeclaration;
} | null {
  const sourceFile = ts.createSourceFile('analysis-function.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const declaration = sourceFile.statements.find(ts.isFunctionDeclaration);
  return declaration?.body ? { sourceFile, declaration } : null;
}

export function isCompleteAnalysisFunctionSource(source: string): boolean {
  return findAnalysisFunctionDeclaration(source) !== null;
}

export function inferAnalysisFunction(source: string, fallbackKind?: AnalysisFunctionKind): InferredAnalysisFunction | null {
  const found = findAnalysisFunctionDeclaration(source);
  if (!found) {
    return fallbackKind ? { functionKind: fallbackKind, functionName: null } : null;
  }
  const functionKind = inferDeclarationKind(found.declaration, found.sourceFile);
  if (!functionKind) return null;
  return {
    functionKind,
    functionName: found.declaration.name?.text ?? null,
  };
}

export function inferAnalysisFunctionKind(source: string, fallbackKind?: AnalysisFunctionKind): AnalysisFunctionKind | null {
  return inferAnalysisFunction(source, fallbackKind)?.functionKind ?? null;
}

export function rewriteAnalysisFunctionName(source: string, functionName: string): string {
  const found = findAnalysisFunctionDeclaration(source);
  if (!found) return source;
  const name = found.declaration.name;
  if (!name) return source;
  return `${source.slice(0, name.getStart(found.sourceFile))}${functionName}${source.slice(name.getEnd())}`;
}
