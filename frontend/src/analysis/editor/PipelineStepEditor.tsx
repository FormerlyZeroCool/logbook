import { pipelineOperationRegistry, type PipelineOperationDescriptor } from '@logbook/analysis-sdk';
import { useEffect, useState } from 'react';
import type { AnalysisFunctionSummary, PipelineDefinitionV1 } from '../../types';

function argumentsText(argumentsList: readonly unknown[] | undefined): string {
  return JSON.stringify(argumentsList ?? []);
}

export function PipelineStepEditor({
  step,
  index,
  functions,
  onChange,
  onRemove,
}: {
  step: PipelineDefinitionV1['steps'][number];
  index: number;
  functions: AnalysisFunctionSummary[];
  onChange: (step: PipelineDefinitionV1['steps'][number]) => void;
  onRemove: () => void;
}) {
  const descriptor = pipelineOperationRegistry.find(
    (item) => item.methodName === step.operation || item.aliases?.includes(step.operation),
  ) as PipelineOperationDescriptor | undefined;
  const compatible = functions.filter(
    (item) => item.published_revision_id
      && (!descriptor?.compatibleFunctionKinds || descriptor.compatibleFunctionKinds.includes(item.function_kind)),
  );
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
      onChange({ ...step, ...(parsed.length ? { arguments: parsed } : { arguments: [] }) });
      setArgumentError(null);
    } catch (error) {
      setArgumentError(error instanceof Error ? error.message : String(error));
    }
  }

  return <div className="pipeline-step">
    <span className="pipeline-step-index">{index + 1}</span>
    <select value={step.operation} onChange={(event) => onChange({ operation: event.target.value })}>
      {[...new Map(pipelineOperationRegistry.map((item) => [item.methodName, item])).values()].map((item) => <option key={item.methodName} value={item.methodName}>{item.editor.label}</option>)}
    </select>
    {descriptor?.compatibleFunctionKinds?.length ? <>
      <select value={step.functionBinding ?? ''} onChange={(event) => {
        const functionBinding = event.target.value;
        onChange({ ...step, ...(functionBinding ? { functionBinding } : {}) });
      }}>
        <option value="">Select function</option>
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
    {step.operation === 'transformWindow' && <label>
      Window
      <input type="number" min={1} value={step.windowSize ?? 4} onChange={(event) => onChange({ ...step, windowSize: Number(event.target.value) })} />
    </label>}
    <button type="button" className="danger" onClick={onRemove}>Remove</button>
  </div>;
}
