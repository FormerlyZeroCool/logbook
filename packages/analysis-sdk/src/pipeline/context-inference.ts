import type { PipelineStep, PipelineValueType } from '../contracts.js';
import { resolveOperation } from './operation-registry.js';

export function inferPipelineContext(inputType: PipelineValueType, steps: readonly PipelineStep[]) {
  let current = inputType;
  let rowsBefore = 0;
  let rowsAfter = 0;
  let mayDrop = false;
  let exact = true;
  for (const step of steps) {
    const descriptor = resolveOperation(step.operation, current);
    if (!descriptor) throw new Error(`Unknown ${current} operation: ${step.operation}`);
    const args = step.arguments ?? (step.windowSize === undefined ? [] : [step.functionBinding, step.windowSize, step.options ?? {}]);
    const context = descriptor.deriveContext(args);
    if (mayDrop && (context.rowsBefore > 0 || context.rowsAfter > 0)) exact = false;
    rowsBefore = Math.max(rowsBefore, context.rowsBefore);
    rowsAfter = Math.max(rowsAfter, context.rowsAfter);
    mayDrop ||= descriptor.rowCardinality === 'may-drop';
    current = descriptor.outputType;
  }
  return { rowsBefore, rowsAfter, exact };
}
