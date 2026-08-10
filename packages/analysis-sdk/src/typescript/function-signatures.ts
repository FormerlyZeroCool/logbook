import * as ts from 'typescript';
import type { AnalysisFunctionKind } from '../contracts.js';

export type AnalysisFunctionMode = 'direct' | 'factory' | 'legacy-direct';

export type InferredAnalysisFunction = {
  functionKind: AnalysisFunctionKind;
  functionName: string | null;
  mode: AnalysisFunctionMode;
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

function hasContext(parameters: readonly string[], offset: number): boolean {
  return parameters[offset] === 'AnalysisContext';
}

function hasLegacyOptionsAndContext(parameters: readonly string[], offset: number): boolean {
  return parameters[offset] === 'AnalysisOptions' && parameters[offset + 1] === 'AnalysisContext';
}

const FACTORY_RETURN_KINDS: Readonly<Record<string, AnalysisFunctionKind>> = Object.freeze({
  NumericMapper: 'point-map',
  NumericPointMapper: 'point-map',
  NumericPredicate: 'point-filter',
  EventPredicate: 'event-filter',
  NumericMapFilter: 'map-filter',
  WindowTransformer: 'window-transform',
  SeriesReducer: 'reducer',
  SeriesTransformer: 'series-transform',
});

function isSerializableFactoryType(node: ts.TypeNode): boolean {
  if (
    node.kind === ts.SyntaxKind.NumberKeyword
    || node.kind === ts.SyntaxKind.StringKeyword
    || node.kind === ts.SyntaxKind.BooleanKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
    || node.kind === ts.SyntaxKind.UndefinedKeyword
  ) return true;

  if (ts.isLiteralTypeNode(node)) return true;
  if (ts.isParenthesizedTypeNode(node)) return isSerializableFactoryType(node.type);
  if (ts.isArrayTypeNode(node)) return isSerializableFactoryType(node.elementType);
  if (ts.isTupleTypeNode(node)) return node.elements.every((element) => {
    if (ts.isNamedTupleMember(element)) return isSerializableFactoryType(element.type);
    if (ts.isOptionalTypeNode(element) || ts.isRestTypeNode(element)) return isSerializableFactoryType(element.type);
    return isSerializableFactoryType(element);
  });
  if (ts.isUnionTypeNode(node)) return node.types.every(isSerializableFactoryType);
  if (ts.isTypeOperatorNode(node)) return isSerializableFactoryType(node.type);
  if (ts.isTypeLiteralNode(node)) {
    return node.members.every((member) =>
      ts.isPropertySignature(member)
      && Boolean(member.type)
      && isSerializableFactoryType(member.type!),
    );
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText();
    return (name === 'Array' || name === 'ReadonlyArray')
      && node.typeArguments?.length === 1
      && isSerializableFactoryType(node.typeArguments[0]!);
  }
  return false;
}

function inferDirectKind(
  declaration: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): { functionKind: AnalysisFunctionKind; mode: AnalysisFunctionMode } | null {
  const parameters = declaration.parameters.map((parameter) => compact(parameter.type, sourceFile));
  const returnType = compact(declaration.type, sourceFile);

  if (
    parameters.length === 4
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasContext(parameters, 3)
    && returnType === 'NumericPoint'
  ) return { functionKind: 'point-map', mode: 'direct' };



  if (
    parameters.length === 3
    && parameters[0] === 'NumericWindow'
    && parameters[1] === 'number'
    && hasContext(parameters, 2)
    && returnType === 'NumericPoint'
  ) return { functionKind: 'window-transform', mode: 'direct' };
  if (
    parameters.length === 4
    && parameters[0] === 'NumericWindow'
    && parameters[1] === 'number'
    && hasLegacyOptionsAndContext(parameters, 2)
    && returnType === 'NumericPoint'
  ) return { functionKind: 'window-transform', mode: 'legacy-direct' };

  if (
    parameters.length === 4
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasContext(parameters, 3)
    && returnType === 'boolean'
  ) return { functionKind: 'point-filter', mode: 'direct' };
  if (
    parameters.length === 5
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasLegacyOptionsAndContext(parameters, 3)
    && returnType === 'boolean'
  ) return { functionKind: 'point-filter', mode: 'legacy-direct' };

  if (
    parameters.length === 3
    && parameters[0] === 'EventRecord'
    && parameters[1] === 'number'
    && hasContext(parameters, 2)
    && returnType === 'boolean'
  ) return { functionKind: 'event-filter', mode: 'direct' };
  if (
    parameters.length === 4
    && parameters[0] === 'EventRecord'
    && parameters[1] === 'number'
    && hasLegacyOptionsAndContext(parameters, 2)
    && returnType === 'boolean'
  ) return { functionKind: 'event-filter', mode: 'legacy-direct' };

  if (
    parameters.length === 3
    && isNullableNumberArray(parameters[0] ?? '')
    && isNumericPointArray(parameters[1] ?? '')
    && hasContext(parameters, 2)
    && isReducerResult(returnType)
  ) return { functionKind: 'reducer', mode: 'direct' };
  if (
    parameters.length === 4
    && isNullableNumberArray(parameters[0] ?? '')
    && isNumericPointArray(parameters[1] ?? '')
    && hasLegacyOptionsAndContext(parameters, 2)
    && isReducerResult(returnType)
  ) return { functionKind: 'reducer', mode: 'legacy-direct' };

  if (
    parameters.length === 4
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasContext(parameters, 3)
    && (isNumericPointOrNull(returnType) || returnType === 'MapFilterResult')
  ) return { functionKind: 'map-filter', mode: 'direct' };
  if (
    parameters.length === 5
    && isNumberOrNull(parameters[0] ?? '')
    && parameters[1] === 'NumericPoint'
    && parameters[2] === 'number'
    && hasLegacyOptionsAndContext(parameters, 3)
    && (isNumericPointOrNull(returnType) || returnType === 'MapFilterResult')
  ) return { functionKind: 'map-filter', mode: 'legacy-direct' };

  if (
    parameters.length === 2
    && parameters[0] === 'NumericSeries'
    && hasContext(parameters, 1)
    && ['AnalysisResult', 'NumericSeries', 'SeriesSet', 'ScalarValue'].includes(returnType)
  ) return { functionKind: 'series-transform', mode: 'direct' };
  if (
    parameters.length === 3
    && parameters[0] === 'NumericSeries'
    && hasLegacyOptionsAndContext(parameters, 1)
    && ['AnalysisResult', 'NumericSeries', 'SeriesSet', 'ScalarValue'].includes(returnType)
  ) return { functionKind: 'series-transform', mode: 'legacy-direct' };

  return null;
}

function inferFactoryKind(
  declaration: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): AnalysisFunctionKind | null {
  const returnType = compact(declaration.type, sourceFile);
  const functionKind = FACTORY_RETURN_KINDS[returnType];
  if (!functionKind || declaration.parameters.length === 0) return null;
  for (const parameter of declaration.parameters) {
    if (!ts.isIdentifier(parameter.name) || !parameter.type || parameter.dotDotDotToken) return null;
    if (!isSerializableFactoryType(parameter.type)) return null;
  }
  return functionKind;
}

export function findAnalysisFunctionDeclaration(source: string): {
  sourceFile: ts.SourceFile;
  declaration: ts.FunctionDeclaration;
} | null {
  const sourceFile = ts.createSourceFile('analysis-function.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const declaration = sourceFile.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && Boolean(statement.body),
  );
  return declaration?.body ? { sourceFile, declaration } : null;
}

export function isCompleteAnalysisFunctionSource(source: string): boolean {
  return findAnalysisFunctionDeclaration(source) !== null;
}

export function inferAnalysisFunction(source: string, fallbackKind?: AnalysisFunctionKind): InferredAnalysisFunction | null {
  const found = findAnalysisFunctionDeclaration(source);
  if (!found) {
    return fallbackKind ? { functionKind: fallbackKind, functionName: null, mode: 'direct' } : null;
  }
  const direct = inferDirectKind(found.declaration, found.sourceFile);
  if (direct) {
    return {
      ...direct,
      functionName: found.declaration.name?.text ?? null,
    };
  }
  const factoryKind = inferFactoryKind(found.declaration, found.sourceFile);
  if (!factoryKind) return null;
  return {
    functionKind: factoryKind,
    functionName: found.declaration.name?.text ?? null,
    mode: 'factory',
  };
}

export function inferAnalysisFunctionKind(source: string, fallbackKind?: AnalysisFunctionKind): AnalysisFunctionKind | null {
  return inferAnalysisFunction(source, fallbackKind)?.functionKind ?? null;
}

function sampleValue(node: ts.TypeNode, sourceFile: ts.SourceFile): string | null {
  if (node.kind === ts.SyntaxKind.NumberKeyword) return '0';
  if (node.kind === ts.SyntaxKind.StringKeyword) return "''";
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return 'false';
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return 'undefined';
  if (ts.isLiteralTypeNode(node)) return node.literal.getText(sourceFile);
  if (ts.isParenthesizedTypeNode(node)) return sampleValue(node.type, sourceFile);
  if (ts.isArrayTypeNode(node)) return '[]';
  if (ts.isTupleTypeNode(node)) {
    const values = node.elements.map((element) => {
      const type = ts.isNamedTupleMember(element) || ts.isOptionalTypeNode(element) || ts.isRestTypeNode(element)
        ? element.type
        : element;
      return sampleValue(type, sourceFile);
    });
    return values.every((value): value is string => value !== null) ? `[${values.join(', ')}]` : null;
  }
  if (ts.isUnionTypeNode(node)) {
    for (const type of node.types) {
      const value = sampleValue(type, sourceFile);
      if (value !== null && value !== 'undefined') return value;
    }
    return 'undefined';
  }
  if (ts.isTypeOperatorNode(node)) return sampleValue(node.type, sourceFile);
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(sourceFile);
    if (name === 'Array' || name === 'ReadonlyArray') return '[]';
    return null;
  }
  if (ts.isTypeLiteralNode(node)) {
    const entries: string[] = [];
    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || member.questionToken || !member.type) continue;
      const propertyName = member.name.getText(sourceFile);
      const value = sampleValue(member.type, sourceFile);
      if (value === null) return null;
      entries.push(`${propertyName}: ${value}`);
    }
    return `{ ${entries.join(', ')} }`;
  }
  return null;
}

/**
 * Build a deterministic fixture-time callable expression. Direct UDFs return
 * their alias. Typed factories are called with safe values derived from their
 * inline parameter types so authoritative validation tests the returned callback.
 */
export function analysisFunctionValidationReference(source: string, alias: string): string | null {
  const found = findAnalysisFunctionDeclaration(source);
  if (!found) return alias;
  const inferred = inferAnalysisFunction(source);
  if (!inferred) return null;
  if (inferred.mode !== 'factory') return alias;
  const argumentsList: string[] = [];
  for (const parameter of found.declaration.parameters) {
    if (parameter.questionToken || parameter.initializer) {
      argumentsList.push('undefined');
      continue;
    }
    if (!parameter.type) return null;
    const value = sampleValue(parameter.type, found.sourceFile);
    if (value === null) return null;
    argumentsList.push(value);
  }
  return `${alias}(${argumentsList.join(', ')})`;
}

export function rewriteAnalysisFunctionName(source: string, functionName: string): string {
  const found = findAnalysisFunctionDeclaration(source);
  if (!found) return source;
  const name = found.declaration.name;
  if (!name) return source;
  return `${source.slice(0, name.getStart(found.sourceFile))}${functionName}${source.slice(name.getEnd())}`;
}
