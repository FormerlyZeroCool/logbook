import type { PipelineDefinitionV1, PipelineStep } from '../contracts.js';
import { analysisFunctionIdentifier, analysisFunctionReference } from '../typescript/source-documents.js';

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function literal(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(sortJson(value));
}

function stepCode(step: PipelineStep): string {
  const canonical = step.operation === 'value'
    ? 'values'
    : ['windowedMap', 'windowed_map'].includes(step.operation)
      ? 'transformWindow'
      : step.operation === 'mapPoints' && step.functionBinding
        ? 'map'
        : step.operation;
  if (step.functionBinding) {
    const functionReference = canonical === 'map'
      ? analysisFunctionReference(step.functionBinding, 'point-map')
      : analysisFunctionIdentifier(step.functionBinding);
    const factoryArguments = step.arguments ?? [];
    const callable = factoryArguments.length > 0
      ? `${functionReference}(${factoryArguments.map(literal).join(', ')})`
      : functionReference;
    const args: string[] = [callable];
    if (step.windowSize !== undefined) args.push(String(step.windowSize));
    // options configure the series operation itself (window alignment, reduce scope),
    // never the UDF. UDF configuration belongs in typed factoryArguments.
    if (step.options && Object.keys(step.options).length > 0 && ['transformWindow', 'reduce'].includes(canonical)) args.push(literal(step.options));
    return `.${canonical}(${args.join(', ')})`;
  }
  return `.${canonical}(${(step.arguments ?? []).map(literal).join(', ')})`;
}

export function generatePipelineExpression(definition: PipelineDefinitionV1): string {
  return [definition.inputAlias, ...definition.steps.map(stepCode)].join('\n  ');
}

export function generateProgramBody(definition: PipelineDefinitionV1): string {
  return `return ${generatePipelineExpression(definition)};`;
}
