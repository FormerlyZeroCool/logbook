import { pipelineOperationRegistry } from '@logbook/analysis-sdk';
import { useEffect, useState } from 'react';
import type { AnalysisFunctionSummary, PipelineDefinitionV1 } from '../../types';
import {
  availablePipelineOperations,
  compatiblePipelineFunctions,
  resolvePipelineOperation,
  unresolvedSelectedPipelineFunctionOption,
  type PipelineValueTypeName,
} from './pipeline-editor-model';

function argumentsText(argumentsList: readonly unknown[] | undefined): string {
  return JSON.stringify(argumentsList ?? []);
}

export function PipelineStepEditor({
  step,
  index,
  inputType,
  functions,
  onChange,
  onRemove,
}: {
  step: PipelineDefinitionV1['steps'][number];
  index: number;
  inputType: PipelineValueTypeName;
  functions: AnalysisFunctionSummary[];
  onChange: (step: PipelineDefinitionV1['steps'][number]) => void;
  onRemove: () => void;
}) {
  const descriptor = resolvePipelineOperation(
    pipelineOperationRegistry,
    step.operation,
    inputType,
  );
  const operations = availablePipelineOperations(pipelineOperationRegistry, inputType);
  const compatible = compatiblePipelineFunctions(functions, descriptor);
  const unresolvedFunction = unresolvedSelectedPipelineFunctionOption(
    functions,
    compatible,
    step.functionBinding,
    descriptor?.editor.label ?? step.operation,
  );
  const operationValue = descriptor?.methodName ?? step.operation;
  const operationIsAvailable = operations.some((item) => item.methodName === operationValue);
  const [factoryArguments, setFactoryArguments] = useState(argumentsText(step.arguments));
  const [argumentError, setArgumentError] = useState<string | null>(null);

  useEffect(() => {
    setFactoryArguments(argumentsText(step.arguments));
    setArgumentError(null);
  }, [step.arguments]);

  function commitFactoryArguments(): void {
    try {
      const parsed: unknown = JSON.parse(factoryArguments || '[]');
      if (!Array.isArray(parsed)) throw new Error('Factory arguments must be a JSON array.');
      onChange({ ...step, arguments: parsed });
      setArgumentError(null);
    } catch (error) {
      setArgumentError(error instanceof Error ? error.message : String(error));
    }
  }

  return <div className="pipeline-step">
    <span className="pipeline-step-index">{index + 1}</span>
    <select value={operationValue} onChange={(event) => onChange({ operation: event.target.value })}>
      {!operationIsAvailable && <option value={operationValue}>{step.operation} (not valid here)</option>}
      {operations.map((item) => <option key={`${item.inputType}:${item.methodName}`} value={item.methodName}>{item.editor.label}</option>)}
    </select>
    {descriptor?.compatibleFunctionKinds?.length ? <>
      <select value={step.functionBinding ?? ''} onChange={(event) => {
        const functionBinding = event.target.value;
        if (functionBinding) {
          onChange({ ...step, functionBinding });
          return;
        }
        const stepWithoutBinding = { ...step };
        delete stepWithoutBinding.functionBinding;
        onChange(stepWithoutBinding);
      }}>
        <option value="">Select function</option>
        {unresolvedFunction && <option value={unresolvedFunction.value}>{unresolvedFunction.label}</option>}
        {compatible.map((item) => <option key={item.id} value={item.function_key}>{item.name}</option>)}
      </select>
      {step.functionBinding ? <label>
        Factory arguments
        <input
          aria-label="Factory arguments as JSON array"
          value={factoryArguments}
          placeholder="[] or [0, 100]"
          onChange={(event) => setFactoryArguments(event.target.value)}
          onBlur={commitFactoryArguments}
          onKeyDown={(event) => { if (event.key === 'Enter') commitFactoryArguments(); }}
        />
        {argumentError && <small className="analysis-error">{argumentError}</small>}
      </label> : null}
    </> : null}
    {descriptor?.methodName === 'transformWindow' && <label>
      Window
      <input type="number" min={1} value={step.windowSize ?? 4} onChange={(event) => onChange({ ...step, windowSize: Number(event.target.value) })} />
    </label>}
    <button type="button" className="danger" onClick={onRemove}>Remove</button>
  </div>;
}
