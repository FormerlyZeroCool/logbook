import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availablePipelineOperations,
  pipelineStepInsertionPoint,
  type PipelineOperationLike,
} from '../src/analysis/editor/pipeline-editor-model.ts';

const registry: PipelineOperationLike[] = [
  {
    methodName: 'values',
    inputType: 'EventSeries',
    outputType: 'NumericSeries',
    editor: { label: 'Values' },
  },
  {
    methodName: 'map',
    inputType: 'NumericSeries',
    outputType: 'NumericSeries',
    editor: { label: 'Map points' },
  },
  {
    methodName: 'reduce',
    inputType: 'NumericSeries',
    outputType: 'ScalarValue',
    editor: { label: 'Reduce' },
  },
];

test('Add step inserts before a terminal scalar reducer', () => {
  const steps = [
    { operation: 'values' },
    { operation: 'map' },
    { operation: 'reduce' },
  ];

  const insertion = pipelineStepInsertionPoint(steps, registry);
  assert.deepEqual(insertion, { index: 2, inputType: 'NumericSeries' });
  assert.equal(
    availablePipelineOperations(registry, insertion?.inputType ?? 'ScalarValue')[0]?.methodName,
    'map',
  );
});

test('Add step appends while the pipeline still returns a series', () => {
  const steps = [
    { operation: 'values' },
    { operation: 'map' },
  ];

  assert.deepEqual(
    pipelineStepInsertionPoint(steps, registry),
    { index: 2, inputType: 'NumericSeries' },
  );
});
