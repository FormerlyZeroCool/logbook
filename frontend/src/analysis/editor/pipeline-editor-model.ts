export type PipelineValueTypeName = 'EventSeries' | 'NumericSeries' | 'ScalarValue' | 'SeriesSet';

export type PipelineOperationLike = {
  methodName: string;
  aliases?: readonly string[];
  inputType: 'EventSeries' | 'NumericSeries';
  outputType: PipelineValueTypeName;
  compatibleFunctionKinds?: readonly string[];
  editor: { label: string };
};

export type PipelineStepLike = {
  operation: string;
};

export type PipelineFunctionLike = {
  function_key: string;
  name: string;
  function_kind: string;
};

export type PipelineFunctionFallbackOption = {
  value: string;
  label: string;
};

export function resolvePipelineOperation(
  registry: readonly PipelineOperationLike[],
  operation: string,
  inputType: PipelineValueTypeName,
): PipelineOperationLike | undefined {
  return registry.find((item) =>
    item.inputType === inputType
    && (item.methodName === operation || item.aliases?.includes(operation)),
  );
}

export function availablePipelineOperations(
  registry: readonly PipelineOperationLike[],
  inputType: PipelineValueTypeName,
): PipelineOperationLike[] {
  if (inputType !== 'EventSeries' && inputType !== 'NumericSeries') return [];
  return registry.filter((item) => item.inputType === inputType);
}

export function pipelineStepInputTypes(
  steps: readonly PipelineStepLike[],
  registry: readonly PipelineOperationLike[],
): PipelineValueTypeName[] {
  let currentType: PipelineValueTypeName = 'EventSeries';
  return steps.map((step) => {
    const inputType = currentType;
    const descriptor = resolvePipelineOperation(registry, step.operation, inputType);
    if (descriptor) currentType = descriptor.outputType;
    return inputType;
  });
}

export type PipelineStepInsertionPoint = {
  index: number;
  inputType: 'EventSeries' | 'NumericSeries';
};

export function pipelineStepsAreValid(
  steps: readonly PipelineStepLike[],
  registry: readonly PipelineOperationLike[],
): boolean {
  let currentType: PipelineValueTypeName = 'EventSeries';

  for (const step of steps) {
    const descriptor = resolvePipelineOperation(
      registry,
      step.operation,
      currentType,
    );
    if (!descriptor) return false;
    currentType = descriptor.outputType;
  }

  return true;
}

export function reorderPipelineSteps<T extends PipelineStepLike>(
  steps: readonly T[],
  fromIndex: number,
  toIndex: number,
  registry: readonly PipelineOperationLike[],
): T[] | null {
  if (
    fromIndex < 0
    || fromIndex >= steps.length
    || toIndex < 0
    || toIndex >= steps.length
  ) {
    return null;
  }

  const reordered = [...steps];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) return null;
  reordered.splice(toIndex, 0, moved);

  return pipelineStepsAreValid(reordered, registry)
    ? reordered
    : null;
}

export function reorderPipelineStepsAtBoundary<T extends PipelineStepLike>(
  steps: readonly T[],
  fromIndex: number,
  boundaryIndex: number,
  registry: readonly PipelineOperationLike[],
): T[] | null {
  if (boundaryIndex < 0 || boundaryIndex > steps.length) return null;

  const toIndex = boundaryIndex > fromIndex
    ? boundaryIndex - 1
    : boundaryIndex;

  return reorderPipelineSteps(steps, fromIndex, toIndex, registry);
}

export function pipelineStepInsertionPoint(
  steps: readonly PipelineStepLike[],
  registry: readonly PipelineOperationLike[],
): PipelineStepInsertionPoint | null {
  let currentType: PipelineValueTypeName = 'EventSeries';

  for (const [index, step] of steps.entries()) {
    if (currentType !== 'EventSeries' && currentType !== 'NumericSeries') {
      return null;
    }

    const descriptor = resolvePipelineOperation(
      registry,
      step.operation,
      currentType,
    );

    if (!descriptor) {
      return { index, inputType: currentType };
    }

    if (
      descriptor.outputType !== 'EventSeries'
      && descriptor.outputType !== 'NumericSeries'
    ) {
      return { index, inputType: currentType };
    }

    currentType = descriptor.outputType;
  }

  if (currentType !== 'EventSeries' && currentType !== 'NumericSeries') {
    return null;
  }

  return { index: steps.length, inputType: currentType };
}

export function pipelineOutputType(
  steps: readonly PipelineStepLike[],
  registry: readonly PipelineOperationLike[],
): PipelineValueTypeName {
  let currentType: PipelineValueTypeName = 'EventSeries';
  for (const step of steps) {
    const descriptor = resolvePipelineOperation(registry, step.operation, currentType);
    if (!descriptor) return currentType;
    currentType = descriptor.outputType;
  }
  return currentType;
}

export function compatiblePipelineFunctions<T extends PipelineFunctionLike>(
  functions: readonly T[],
  descriptor: Pick<PipelineOperationLike, 'compatibleFunctionKinds'> | undefined,
): T[] {
  const kinds = descriptor?.compatibleFunctionKinds;
  if (!kinds?.length) return [...functions];
  return functions.filter((item) => kinds.includes(item.function_kind));
}

export function unresolvedSelectedPipelineFunctionOption<T extends PipelineFunctionLike>(
  functions: readonly T[],
  compatibleFunctions: readonly T[],
  selectedKey: string | undefined,
  operationLabel: string,
): PipelineFunctionFallbackOption | null {
  if (!selectedKey || compatibleFunctions.some((item) => item.function_key === selectedKey)) {
    return null;
  }

  const selected = functions.find((item) => item.function_key === selectedKey);
  return {
    value: selectedKey,
    label: selected
      ? `${selected.name} (not compatible with ${operationLabel})`
      : `${selectedKey} (currently unavailable)`,
  };
}
