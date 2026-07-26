import type { PipelineDefinitionV1, PipelineStep } from '../contracts.js';
import { analysisFunctionIdentifier } from '../typescript/source-documents.js';

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
  const canonical = step.operation === 'value' ? 'values' : ['windowedMap', 'windowed_map'].includes(step.operation) ? 'transformWindow' : step.operation;
  if (step.functionBinding) {
    const args: string[] = [analysisFunctionIdentifier(step.functionBinding)];
    if (step.windowSize !== undefined) args.push(String(step.windowSize));
    if (step.options && Object.keys(step.options).length > 0) args.push(literal(step.options));
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
