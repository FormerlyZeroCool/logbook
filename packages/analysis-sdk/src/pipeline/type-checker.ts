import type { AnalysisFunctionKind, PipelineDefinitionV1, PipelineStep, PipelineValueType, SourceDiagnostic } from '../contracts.js';
import { inferPipelineContext } from './context-inference.js';
import { resolveOperation } from './operation-registry.js';

export type FunctionBindingTypes = Record<string, AnalysisFunctionKind>;

export function typeCheckPipeline(inputAlias: string, steps: readonly PipelineStep[], bindings: FunctionBindingTypes = {}): { definition: PipelineDefinitionV1 | null; diagnostics: SourceDiagnostic[] } {
  const diagnostics: SourceDiagnostic[] = [];
  let current: PipelineValueType = 'EventSeries';
  let terminal = false;
  for (const [index, step] of steps.entries()) {
    if (terminal) diagnostics.push({ severity: 'error', code: 'call_after_terminal', message: `No operation may follow ${steps[index - 1]?.operation ?? 'a terminal'}`, line: 1, column: 1 });
    const descriptor = resolveOperation(step.operation, current);
    if (!descriptor) {
      diagnostics.push({ severity: 'error', code: 'invalid_operation', message: `${step.operation} is not valid on ${current}`, line: 1, column: 1 });
      continue;
    }
    if (descriptor.compatibleFunctionKinds) {
      if (!step.functionBinding) {
        diagnostics.push({ severity: 'error', code: 'missing_function', message: `${descriptor.methodName} requires a reusable function binding`, line: 1, column: 1 });
      } else {
        const kind = bindings[step.functionBinding];
        if (!kind || !descriptor.compatibleFunctionKinds.includes(kind)) diagnostics.push({ severity: 'error', code: 'incompatible_function', message: `${step.functionBinding} is not compatible with ${descriptor.methodName}`, line: 1, column: 1 });
      }
    }
    if (descriptor.methodName === 'transformWindow' && (!Number.isInteger(step.windowSize) || (step.windowSize ?? 0) < 1)) {
      diagnostics.push({ severity: 'error', code: 'invalid_window_size', message: 'transformWindow requires a positive integer window size', line: 1, column: 1 });
    }
    current = descriptor.outputType;
    terminal = descriptor.terminal ?? false;
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { definition: null, diagnostics };
  const context = inferPipelineContext('EventSeries', steps);
  return {
    definition: {
      schemaVersion: 1,
      inputAlias,
      steps: [...steps],
      outputType: current,
      queryContext: { mode: context.exact ? 'derived' : 'explicit-or-derived', ...context }
    },
    diagnostics
  };
}
