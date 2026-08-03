import { generateProgramBody, pipelineOperationRegistry, type PipelineDefinitionV1 } from '@logbook/analysis-sdk';
import type { AnalysisFunctionSummary } from '../../types';
import {
  availablePipelineOperations,
  pipelineOutputType,
  pipelineStepInputTypes,
} from './pipeline-editor-model';
import { PipelineStepEditor } from './PipelineStepEditor';

export function PipelineEditor({
  definition,
  functions,
  onChange,
}: {
  definition: PipelineDefinitionV1;
  functions: AnalysisFunctionSummary[];
  onChange: (definition: PipelineDefinitionV1) => void;
}) {
  const inputTypes = pipelineStepInputTypes(definition.steps, pipelineOperationRegistry);
  const outputType = pipelineOutputType(definition.steps, pipelineOperationRegistry);
  const nextOperation = availablePipelineOperations(pipelineOperationRegistry, outputType)[0];

  const changeStep = (index: number, step: PipelineDefinitionV1['steps'][number]): void => {
    onChange({
      ...definition,
      steps: definition.steps.map((item, itemIndex) => itemIndex === index ? step : item),
    });
  };

  return <div className="analysis-panel">
    <div className="analysis-panel-heading">
      <h2>Pipeline</h2>
      <button
        type="button"
        disabled={!nextOperation}
        onClick={() => {
          if (!nextOperation) return;
          onChange({
            ...definition,
            steps: [...definition.steps, { operation: nextOperation.methodName }],
          });
        }}
      >
        Add step
      </button>
    </div>
    <div className="pipeline-root"><code>{definition.inputAlias}</code><span>EventSeries</span></div>
    {definition.steps.map((step, index) => <PipelineStepEditor
      key={index}
      step={step}
      index={index}
      inputType={inputTypes[index] ?? 'EventSeries'}
      functions={functions}
      onChange={(value) => changeStep(index, value)}
      onRemove={() => onChange({
        ...definition,
        steps: definition.steps.filter((_item, itemIndex) => itemIndex !== index),
      })}
    />)}
    <details><summary>Generated JavaScript</summary><pre>{generateProgramBody(definition)}</pre></details>
  </div>;
}
