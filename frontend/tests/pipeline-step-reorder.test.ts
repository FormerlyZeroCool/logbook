import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pipelineStepsAreValid,
  reorderPipelineSteps,
  reorderPipelineStepsAtBoundary,
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
    methodName: 'filter',
    inputType: 'NumericSeries',
    outputType: 'NumericSeries',
    editor: { label: 'Filter points' },
  },
  {
    methodName: 'reduce',
    inputType: 'NumericSeries',
    outputType: 'ScalarValue',
    editor: { label: 'Reduce' },
  },
];

const steps = [
  { operation: 'values' },
  { operation: 'map' },
  { operation: 'filter' },
  { operation: 'reduce' },
];

test('reorders compatible numeric-series steps without mutating the source array', () => {
  const reordered = reorderPipelineSteps(steps, 1, 2, registry);
  assert.deepEqual(reordered?.map((step) => step.operation), [
    'values',
    'filter',
    'map',
    'reduce',
  ]);
  assert.deepEqual(steps.map((step) => step.operation), [
    'values',
    'map',
    'filter',
    'reduce',
  ]);
});

test('rejects a reorder that moves a NumericSeries operation before values()', () => {
  assert.equal(reorderPipelineSteps(steps, 1, 0, registry), null);
});

test('rejects a reorder that places a terminal reducer before later series steps', () => {
  assert.equal(reorderPipelineSteps(steps, 3, 1, registry), null);
});

test('converts visual drop boundaries into final array positions', () => {
  const reordered = reorderPipelineStepsAtBoundary(steps, 2, 1, registry);
  assert.deepEqual(reordered?.map((step) => step.operation), [
    'values',
    'filter',
    'map',
    'reduce',
  ]);
});

test('recognizes valid and invalid pipeline operation order', () => {
  assert.equal(pipelineStepsAreValid(steps, registry), true);
  assert.equal(
    pipelineStepsAreValid([
      { operation: 'map' },
      { operation: 'values' },
    ], registry),
    false,
  );
});
