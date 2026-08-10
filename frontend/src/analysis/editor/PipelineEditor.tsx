import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { generateProgramBody, pipelineOperationRegistry, type PipelineDefinitionV1 } from '@logbook/analysis-sdk';
import type { AnalysisFunctionSummary } from '../../types';
import {
  availablePipelineOperations,
  pipelineStepInsertionPoint,
  pipelineStepInputTypes,
  reorderPipelineStepsAtBoundary,
  reorderPipelineSteps,
} from './pipeline-editor-model';
import { PipelineStepEditor } from './PipelineStepEditor';


type PipelineDropPosition = 'before' | 'after';

type PipelineDropTarget = {
  rowIndex: number;
  boundaryIndex: number;
  position: PipelineDropPosition;
  allowed: boolean;
};

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
  const insertionPoint = pipelineStepInsertionPoint(
    definition.steps,
    pipelineOperationRegistry,
  );
  const nextOperation = insertionPoint
    ? availablePipelineOperations(
        pipelineOperationRegistry,
        insertionPoint.inputType,
      )[0]
    : undefined;

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<PipelineDropTarget | null>(null);

  const resetDragState = (): void => {
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const boundaryForPointer = (
    event: DragEvent<HTMLDivElement>,
    rowIndex: number,
  ): { boundaryIndex: number; position: PipelineDropPosition } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position: PipelineDropPosition = event.clientY < bounds.top + bounds.height / 2
      ? 'before'
      : 'after';
    return {
      boundaryIndex: rowIndex + (position === 'after' ? 1 : 0),
      position,
    };
  };

  const beginStepDrag = (
    event: DragEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    setDraggedIndex(index);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-logbook-pipeline-step', String(index));
    event.dataTransfer.setData('text/plain', String(index));
  };

  const previewStepDrop = (
    event: DragEvent<HTMLDivElement>,
    rowIndex: number,
  ): void => {
    if (draggedIndex === null) return;

    const { boundaryIndex, position } = boundaryForPointer(event, rowIndex);
    const candidate = reorderPipelineStepsAtBoundary(
      definition.steps,
      draggedIndex,
      boundaryIndex,
      pipelineOperationRegistry,
    );

    event.preventDefault();
    event.dataTransfer.dropEffect = candidate ? 'move' : 'none';
    setDropTarget({
      rowIndex,
      boundaryIndex,
      position,
      allowed: candidate !== null,
    });
  };

  const commitStepDrop = (
    event: DragEvent<HTMLDivElement>,
    rowIndex: number,
  ): void => {
    event.preventDefault();
    if (draggedIndex === null) return;

    const { boundaryIndex } = boundaryForPointer(event, rowIndex);
    const reordered = reorderPipelineStepsAtBoundary(
      definition.steps,
      draggedIndex,
      boundaryIndex,
      pipelineOperationRegistry,
    );

    if (reordered) onChange({ ...definition, steps: reordered });
    resetDragState();
  };

  const moveStepByOffset = (index: number, offset: -1 | 1): void => {
    const reordered = reorderPipelineSteps(
      definition.steps,
      index,
      index + offset,
      pipelineOperationRegistry,
    );
    if (reordered) onChange({ ...definition, steps: reordered });
  };

  const handleDragKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveStepByOffset(index, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveStepByOffset(index, 1);
    }
  };

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
        title={insertionPoint && insertionPoint.index < definition.steps.length
          ? 'Insert before the terminal scalar step'
          : 'Append a pipeline step'}
        onClick={() => {
          if (!nextOperation || !insertionPoint) return;
          const steps = [...definition.steps];
          steps.splice(
            insertionPoint.index,
            0,
            { operation: nextOperation.methodName },
          );
          onChange({ ...definition, steps });
        }}
      >
        Add step
      </button>
    </div>
    <div className="pipeline-root"><code>{definition.inputAlias}</code><span>EventSeries</span></div>
    {definition.steps.map((step, index) => {
      const isDragging = draggedIndex === index;
      const rowDropTarget = dropTarget?.rowIndex === index ? dropTarget : null;
      const rowClasses = [
        'pipeline-step-dnd-row',
        isDragging ? 'is-dragging' : '',
        rowDropTarget ? `is-drop-${rowDropTarget.position}` : '',
        rowDropTarget && !rowDropTarget.allowed ? 'is-drop-invalid' : '',
      ].filter(Boolean).join(' ');
      const stepKey = [
        index,
        step.operation,
        step.functionBinding ?? '',
        JSON.stringify(step.arguments ?? []),
        step.windowSize ?? '',
      ].join(':');

      return <div
        key={stepKey}
        className={rowClasses}
        data-pipeline-step-index={index}
        onDragOver={(event) => previewStepDrop(event, index)}
        onDrop={(event) => commitStepDrop(event, index)}
      >
        <button
          type="button"
          className="pipeline-step-drag-handle"
          draggable
          aria-label={`Reorder pipeline step ${index + 1}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          title="Drag to reorder. Alt+Up/Down also moves this step."
          onDragStart={(event) => beginStepDrag(event, index)}
          onDragEnd={resetDragState}
          onKeyDown={(event) => handleDragKeyDown(event, index)}
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <PipelineStepEditor
          step={step}
          index={index}
          inputType={inputTypes[index] ?? 'EventSeries'}
          functions={functions}
          onChange={(value) => changeStep(index, value)}
          onRemove={() => onChange({
            ...definition,
            steps: definition.steps.filter((_item, itemIndex) => itemIndex !== index),
          })}
        />
      </div>;
    })}
    <details><summary>Generated JavaScript</summary><pre>{generateProgramBody(definition)}</pre></details>
  </div>;
}
