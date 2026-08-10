import type {
  AnalysisFunctionKind,
  PipelineDefinitionV1,
  PipelineStep,
  PipelineValueType,
} from '../contracts.js';
import { analysisFunctionIdentifier, analysisFunctionReference } from '../typescript/source-documents.js';
import { resolveOperation } from './operation-registry.js';

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

function literal(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(sortJson(value));
}

function canonicalOperation(step: PipelineStep): string {
  if (step.operation === 'value') return 'values';
  if (['windowedMap', 'windowed_map'].includes(step.operation)) return 'transformWindow';
  if (step.operation === 'mapPoints' && step.functionBinding) return 'map';
  return step.operation;
}

function stepCode(step: PipelineStep, functionKind?: AnalysisFunctionKind): string {
  const canonical = canonicalOperation(step);
  if (step.functionBinding) {
    const functionReference = functionKind
      ? analysisFunctionReference(step.functionBinding, functionKind)
      : analysisFunctionIdentifier(step.functionBinding);
    const factoryArguments = step.arguments ?? [];
    const callable = factoryArguments.length > 0
      ? `${functionReference}(${factoryArguments.map(literal).join(', ')})`
      : functionReference;
    const args: string[] = [callable];
    if (step.windowSize !== undefined) args.push(String(step.windowSize));
    // options configure the series operation itself (window alignment, reduce scope),
    // never the UDF. UDF configuration belongs in typed factory arguments.
    if (step.options && Object.keys(step.options).length > 0 && ['transformWindow', 'reduce'].includes(canonical)) {
      args.push(literal(step.options));
    }
    return `.${canonical}(${args.join(', ')})`;
  }
  return `.${canonical}(${(step.arguments ?? []).map(literal).join(', ')})`;
}

export function generatePipelineExpression(definition: PipelineDefinitionV1): string {
  const lines = [definition.inputAlias];
  let currentType: PipelineValueType = 'EventSeries';

  for (const step of definition.steps) {
    const descriptor = resolveOperation(step.operation, currentType);
    lines.push(stepCode(step, descriptor?.compatibleFunctionKinds?.[0]));
    if (descriptor) currentType = descriptor.outputType;
  }

  return lines.join('\n  ');
}

export function generateProgramBody(definition: PipelineDefinitionV1): string {
  return `return ${generatePipelineExpression(definition)};`;
}
