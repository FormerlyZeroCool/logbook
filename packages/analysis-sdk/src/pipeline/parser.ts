import * as ts from 'typescript';
import type {
  AnalysisFunctionKind,
  PipelineDefinitionV1,
  PipelineStep,
  PipelineValueType,
  SourceDiagnostic,
} from '../contracts.js';
import { resolveOperation } from './operation-registry.js';
import { typeCheckPipeline, type FunctionBindingTypes } from './type-checker.js';

const COLLECTION_KINDS: Readonly<Record<string, AnalysisFunctionKind | undefined>> = Object.freeze({
  mappers: 'point-map',
  // Event and numeric predicates intentionally share udf.filters. The current
  // pipeline value type disambiguates them during operation resolution.
  filters: undefined,
  reducers: 'reducer',
  window_transforms: 'window-transform',
  map_filters: 'map-filter',
  series_transforms: 'series-transform',
});

type ParsedFunctionReference = {
  functionBinding: string;
  factoryArguments: unknown[];
  collection?: string;
  inferredKind?: AnalysisFunctionKind;
};

function sourceDiagnostic(
  sourceFile: ts.SourceFile,
  node: ts.Node | undefined,
  message: string,
  code: string = 'pipeline_parse_error',
): SourceDiagnostic {
  const position = sourceFile.getLineAndCharacterOfPosition(node?.getStart(sourceFile) ?? 0);
  return {
    severity: 'error',
    code,
    message,
    line: position.line + 1,
    column: position.character + 1,
  };
}

function parseFailure(sourceFile: ts.SourceFile): SourceDiagnostic | null {
  const parseDiagnostic = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics[0];
  if (!parseDiagnostic) return null;
  const position = sourceFile.getLineAndCharacterOfPosition(parseDiagnostic.start ?? 0);
  return {
    severity: 'error',
    code: 'pipeline_parse_error',
    message: ts.flattenDiagnosticMessageText(parseDiagnostic.messageText, '\n'),
    line: position.line + 1,
    column: position.character + 1,
  };
}

function literal(node: ts.Expression, sourceFile: ts.SourceFile): unknown {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && node.text === 'undefined') return undefined;
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    const value = Number(node.operand.text);
    if (node.operator === ts.SyntaxKind.MinusToken) return -value;
    if (node.operator === ts.SyntaxKind.PlusToken) return value;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literal(element, sourceFile));
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || property.name === undefined || ts.isComputedPropertyName(property.name)) {
        throw new Error('Pipeline object keys must be plain literals');
      }
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
        ? property.name.text
        : property.name.getText(sourceFile);
      return [key, literal(property.initializer, sourceFile)];
    }));
  }
  throw new Error(`Unsupported pipeline argument: ${node.getText(sourceFile)}`);
}


function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function udfReference(node: ts.Expression, sourceFile: ts.SourceFile): ParsedFunctionReference | null {
  let reference: ts.Expression = unwrapExpression(node);
  let factoryArguments: unknown[] = [];

  if (ts.isCallExpression(reference)) {
    factoryArguments = reference.arguments.map((argument) => literal(argument, sourceFile));
    reference = unwrapExpression(reference.expression);
  }

  if (!ts.isPropertyAccessExpression(reference)) return null;
  const collectionAccess = reference.expression;
  if (!ts.isPropertyAccessExpression(collectionAccess)) return null;
  if (!ts.isIdentifier(collectionAccess.expression) || collectionAccess.expression.text !== 'udf') return null;

  const collection = collectionAccess.name.text;
  if (!(collection in COLLECTION_KINDS)) throw new Error(`Unknown udf collection: ${collection}`);

  return {
    functionBinding: reference.name.text,
    factoryArguments,
    collection,
    ...(COLLECTION_KINDS[collection] ? { inferredKind: COLLECTION_KINDS[collection] } : {}),
  };
}

function functionReference(node: ts.Expression, sourceFile: ts.SourceFile): ParsedFunctionReference | null {
  const nested = udfReference(node, sourceFile);
  if (nested) return nested;
  if (ts.isIdentifier(node)) return { functionBinding: node.text, factoryArguments: [] };
  return null;
}

function parsePipelineNode(
  rootNode: ts.Expression,
  sourceFile: ts.SourceFile,
  bindings: FunctionBindingTypes,
): { definition: PipelineDefinitionV1 | null; diagnostics: SourceDiagnostic[] } {
  let node: ts.Expression = unwrapExpression(rootNode);
  const calls: ts.CallExpression[] = [];

  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    calls.unshift(node);
    node = unwrapExpression(node.expression.expression);
  }

  if (!ts.isIdentifier(node)) {
    return {
      definition: null,
      diagnostics: [sourceDiagnostic(sourceFile, node, 'Pipeline must start with an input alias')],
    };
  }

  const inferredBindings: FunctionBindingTypes = { ...bindings };
  const steps: PipelineStep[] = [];
  let currentType: PipelineValueType = 'EventSeries';

  try {
    for (const call of calls) {
      const propertyAccess = call.expression as ts.PropertyAccessExpression;
      const operation = propertyAccess.name.text;
      const descriptor = resolveOperation(operation, currentType);
      const firstArgument = call.arguments[0];
      const parsedFunction = firstArgument ? functionReference(firstArgument, sourceFile) : null;

      if (parsedFunction) {
        const expectedKind = descriptor?.compatibleFunctionKinds?.[0];
        if (parsedFunction.inferredKind && expectedKind && parsedFunction.inferredKind !== expectedKind) {
          throw new Error(`udf.${parsedFunction.collection} is not compatible with ${operation}`);
        }
        if (!inferredBindings[parsedFunction.functionBinding]) {
          const inferredKind = parsedFunction.inferredKind ?? expectedKind;
          if (inferredKind) inferredBindings[parsedFunction.functionBinding] = inferredKind;
        }
        const isWindow = ['transformWindow', 'windowedMap', 'windowed_map'].includes(operation);
        const isReduce = operation === 'reduce';
        const windowSize = isWindow && call.arguments[1]
          ? literal(call.arguments[1], sourceFile) as number
          : undefined;
        const optionNode = isWindow ? call.arguments[2] : isReduce ? call.arguments[1] : undefined;
        const options = optionNode ? literal(optionNode, sourceFile) as Record<string, unknown> : undefined;

        steps.push({
          operation,
          functionBinding: parsedFunction.functionBinding,
          ...(parsedFunction.factoryArguments.length ? { arguments: parsedFunction.factoryArguments } : {}),
          ...(windowSize === undefined ? {} : { windowSize }),
          ...(options === undefined ? {} : { options }),
        });
      } else {
        steps.push({
          operation,
          arguments: call.arguments.map((argument) => literal(argument, sourceFile)),
        });
      }

      if (descriptor) currentType = descriptor.outputType;
    }
  } catch (error) {
    return {
      definition: null,
      diagnostics: [sourceDiagnostic(
        sourceFile,
        rootNode,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  return typeCheckPipeline(node.text, steps, inferredBindings);
}

function expressionSourceFile(source: string): { sourceFile: ts.SourceFile; expression: ts.Expression | null } {
  const wrapped = `const __pipeline = (${source});`;
  const sourceFile = ts.createSourceFile('pipeline-expression.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = sourceFile.statements[0];
  const expression = statement && ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0]?.initializer ?? null
    : null;
  return { sourceFile, expression };
}

export function parsePipelineExpression(
  source: string,
  bindings: FunctionBindingTypes = {},
): { definition: PipelineDefinitionV1 | null; diagnostics: SourceDiagnostic[] } {
  const { sourceFile, expression } = expressionSourceFile(source);
  const failure = parseFailure(sourceFile);
  if (failure) return { definition: null, diagnostics: [failure] };
  if (!expression) {
    return {
      definition: null,
      diagnostics: [sourceDiagnostic(sourceFile, undefined, 'Could not parse pipeline expression')],
    };
  }
  return parsePipelineNode(expression, sourceFile, bindings);
}

/**
 * Parse the user-authored transform body into the visual pipeline subset.
 *
 * The visual pipeline deliberately accepts one direct return chain only. Valid
 * TypeScript that contains declarations, branches, multiple returns, or other
 * statements remains fully supported in Code mode but is not rewritten or
 * partially represented by the visual editor.
 */
export function parseProgramBody(
  sourceBody: string,
  bindings: FunctionBindingTypes = {},
): { definition: PipelineDefinitionV1 | null; diagnostics: SourceDiagnostic[] } {
  const wrapped = `function __logbook_transform() {\n${sourceBody}\n}`;
  const sourceFile = ts.createSourceFile('analysis-program.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const failure = parseFailure(sourceFile);
  if (failure) {
    return {
      definition: null,
      diagnostics: [{ ...failure, line: Math.max(1, failure.line - 1) }],
    };
  }

  const declaration = sourceFile.statements[0];
  const statements = declaration && ts.isFunctionDeclaration(declaration)
    ? declaration.body?.statements.filter((statement) => statement.kind !== ts.SyntaxKind.EmptyStatement) ?? []
    : [];
  const statement = statements[0];
  if (statements.length !== 1 || !statement || !ts.isReturnStatement(statement) || !statement.expression) {
    const diagnostic = sourceDiagnostic(
      sourceFile,
      statement,
      'The visual pipeline can represent only a single returned method chain. Continue editing this program in Code mode.',
      'pipeline_unrepresentable',
    );
    return {
      definition: null,
      diagnostics: [{ ...diagnostic, line: Math.max(1, diagnostic.line - 1) }],
    };
  }

  const result = parsePipelineNode(statement.expression, sourceFile, bindings);
  return {
    ...result,
    diagnostics: result.diagnostics.map((item) => ({ ...item, line: Math.max(1, item.line - 1) })),
  };
}
