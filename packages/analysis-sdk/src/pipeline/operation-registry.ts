import type { AnalysisFunctionKind, PipelineValueType } from '../contracts.js';

export type PipelineOperationDescriptor = {
  methodName: string;
  aliases?: string[];
  inputType: 'EventSeries' | 'NumericSeries';
  outputType: PipelineValueType;
  rowCardinality: 'preserve' | 'may-drop' | 'collapse';
  terminal?: boolean;
  compatibleFunctionKinds?: AnalysisFunctionKind[];
  deriveContext(args: readonly unknown[]): { rowsBefore: number; rowsAfter: number; exact: boolean };
  editor: { label: string; description: string; category: string };
};

const none = () => ({ rowsBefore: 0, rowsAfter: 0, exact: true });
const offsetContext = (args: readonly unknown[]) => ({ rowsBefore: Math.max(0, Number(args[0] ?? 1)), rowsAfter: 0, exact: true });
const windowContext = (args: readonly unknown[]) => {
  const size = Math.max(1, Number(args[1] ?? args[0] ?? 1));
  const options = (args.at(-1) && typeof args.at(-1) === 'object' ? args.at(-1) : {}) as { alignment?: string };
  if (options.alignment === 'leading') return { rowsBefore: 0, rowsAfter: size - 1, exact: true };
  if (options.alignment === 'centered') {
    const before = Math.floor((size - 1) / 2);
    return { rowsBefore: before, rowsAfter: size - 1 - before, exact: true };
  }
  return { rowsBefore: size - 1, rowsAfter: 0, exact: true };
};

export const pipelineOperationRegistry: readonly PipelineOperationDescriptor[] = Object.freeze([
  { methodName: 'values', aliases: ['value'], inputType: 'EventSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: none, editor: { label: 'Values', description: 'Select numeric event values.', category: 'Input' } },
  { methodName: 'durations', inputType: 'EventSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: none, editor: { label: 'Durations', description: 'Calculate elapsed event duration.', category: 'Input' } },
  { methodName: 'timeBetweenStarts', inputType: 'EventSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: () => ({ rowsBefore: 1, rowsAfter: 0, exact: true }), editor: { label: 'Time between starts', description: 'Calculate start-to-start gaps.', category: 'Input' } },
  { methodName: 'timeUntilNextStart', inputType: 'EventSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: () => ({ rowsBefore: 0, rowsAfter: 1, exact: true }), editor: { label: 'Time until next start', description: 'Attach each forward gap to the earlier event.', category: 'Input' } },
  { methodName: 'filter', inputType: 'EventSeries', outputType: 'EventSeries', rowCardinality: 'may-drop', compatibleFunctionKinds: ['event-filter'], deriveContext: none, editor: { label: 'Filter events', description: 'Keep matching events.', category: 'Functional' } },
  { methodName: 'map', aliases: ['mapPoints'], inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', compatibleFunctionKinds: ['point-map'], deriveContext: none, editor: { label: 'Map points', description: 'Return a complete NumericPoint for every input row.', category: 'Functional' } },
  { methodName: 'mapValues', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: none, editor: { label: 'Map values', description: 'Transform only numeric values while preserving the original point metadata.', category: 'Functional' } },
  { methodName: 'filter', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'may-drop', compatibleFunctionKinds: ['point-filter'], deriveContext: none, editor: { label: 'Filter points', description: 'Keep points whose predicate returns true.', category: 'Functional' } },
  { methodName: 'mapFilter', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'may-drop', compatibleFunctionKinds: ['map-filter'], deriveContext: none, editor: { label: 'Map/filter', description: 'Transform or explicitly drop each point.', category: 'Functional' } },
  { methodName: 'transformWindow', aliases: ['windowedMap', 'windowed_map'], inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', compatibleFunctionKinds: ['window-transform'], deriveContext: windowContext, editor: { label: 'Transform window', description: 'Apply a function to trailing, centered, or leading windows.', category: 'Functional' } },
  { methodName: 'reduce', inputType: 'NumericSeries', outputType: 'ScalarValue', rowCardinality: 'collapse', terminal: true, compatibleFunctionKinds: ['reducer'], deriveContext: none, editor: { label: 'Reduce', description: 'Collapse the visible series to a scalar.', category: 'Terminal' } },
  { methodName: 'filterNulls', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'may-drop', deriveContext: none, editor: { label: 'Filter nulls', description: 'Drop null-valued points.', category: 'Helpers' } },
  { methodName: 'lag', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: offsetContext, editor: { label: 'Lag', description: 'Shift values backward.', category: 'Helpers' } },
  { methodName: 'lead', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: (args) => ({ rowsBefore: 0, rowsAfter: Math.max(0, Number(args[0] ?? 1)), exact: true }), editor: { label: 'Lead', description: 'Shift values forward.', category: 'Helpers' } },
  { methodName: 'difference', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: offsetContext, editor: { label: 'Difference', description: 'Subtract a prior aligned value.', category: 'Helpers' } },
  { methodName: 'rollingMean', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: (args) => windowContext([null, args[0], args[1]]), editor: { label: 'Rolling mean', description: 'Calculate a rolling mean.', category: 'Helpers' } },
  { methodName: 'cumulativeSum', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: none, editor: { label: 'Cumulative sum', description: 'Accumulate values.', category: 'Helpers' } },
  { methodName: 'bucket', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'may-drop', deriveContext: none, editor: { label: 'Bucket', description: 'Aggregate points into time buckets.', category: 'Helpers' } },
  { methodName: 'divideByAligned', inputType: 'NumericSeries', outputType: 'NumericSeries', rowCardinality: 'preserve', deriveContext: none, editor: { label: 'Divide aligned', description: 'Divide by an aligned series.', category: 'Helpers' } }
]);

export function resolveOperation(methodName: string, inputType: PipelineValueType): PipelineOperationDescriptor | undefined {
  return pipelineOperationRegistry.find((operation) => operation.inputType === inputType && (operation.methodName === methodName || operation.aliases?.includes(methodName)));
}
