import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availablePipelineOperations,
  compatiblePipelineFunctions,
  pipelineOutputType,
  pipelineStepInputTypes,
  resolvePipelineOperation,
  unresolvedSelectedPipelineFunctionOption,
  type PipelineFunctionLike,
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
    methodName: 'filter',
    inputType: 'EventSeries',
    outputType: 'EventSeries',
    compatibleFunctionKinds: ['event-filter'],
    editor: { label: 'Filter events' },
  },
  {
    methodName: 'map',
    aliases: ['mapPoints'],
    inputType: 'NumericSeries',
    outputType: 'NumericSeries',
    compatibleFunctionKinds: ['point-map'],
    editor: { label: 'Map points' },
  },
  {
    methodName: 'filter',
    inputType: 'NumericSeries',
    outputType: 'NumericSeries',
    compatibleFunctionKinds: ['point-filter'],
    editor: { label: 'Filter points' },
  },
  {
    methodName: 'reduce',
    inputType: 'NumericSeries',
    outputType: 'ScalarValue',
    compatibleFunctionKinds: ['reducer'],
    editor: { label: 'Reduce' },
  },
];

const functions: Array<PipelineFunctionLike & {
  published_revision_id: string | null;
  draft_revision_id: string | null;
}> = [
  {
    function_key: 'sum',
    name: 'Sum',
    function_kind: 'reducer',
    published_revision_id: null,
    draft_revision_id: null,
  },
  {
    function_key: 'mean',
    name: 'Mean',
    function_kind: 'reducer',
    published_revision_id: null,
    draft_revision_id: 'draft-mean',
  },
  {
    function_key: 'positive_only',
    name: 'Positive only',
    function_kind: 'point-filter',
    published_revision_id: null,
    draft_revision_id: null,
  },
  {
    function_key: 'event_is_ongoing',
    name: 'Event is ongoing',
    function_kind: 'event-filter',
    published_revision_id: 'published-event-filter',
    draft_revision_id: null,
  },
];

test('pipeline function choices use the full compatible catalog, not publication state', () => {
  const reduce = resolvePipelineOperation(registry, 'reduce', 'NumericSeries');
  assert.ok(reduce);
  assert.deepEqual(
    compatiblePipelineFunctions(functions, reduce).map((item) => item.function_key),
    ['sum', 'mean'],
  );
});

test('filter operation compatibility follows the value type at that step', () => {
  const eventFilter = resolvePipelineOperation(registry, 'filter', 'EventSeries');
  const pointFilter = resolvePipelineOperation(registry, 'filter', 'NumericSeries');
  assert.equal(eventFilter?.editor.label, 'Filter events');
  assert.equal(pointFilter?.editor.label, 'Filter points');
  assert.deepEqual(
    compatiblePipelineFunctions(functions, pointFilter).map((item) => item.function_key),
    ['positive_only'],
  );
});

test('step input types are derived in order and scalar output is terminal', () => {
  const steps = [
    { operation: 'values' },
    { operation: 'mapPoints' },
    { operation: 'reduce' },
  ];
  assert.deepEqual(
    pipelineStepInputTypes(steps, registry),
    ['EventSeries', 'NumericSeries', 'NumericSeries'],
  );
  assert.equal(pipelineOutputType(steps, registry), 'ScalarValue');
  assert.deepEqual(availablePipelineOperations(registry, 'ScalarValue'), []);
});

test('an unresolved selected function is retained instead of rendering a blank select', () => {
  const reduce = resolvePipelineOperation(registry, 'reduce', 'NumericSeries');
  assert.ok(reduce);
  const compatible = compatiblePipelineFunctions(functions, reduce);
  assert.deepEqual(
    unresolvedSelectedPipelineFunctionOption(
      functions,
      compatible,
      'missing_reducer',
      reduce.editor.label,
    ),
    {
      value: 'missing_reducer',
      label: 'missing_reducer (currently unavailable)',
    },
  );
});
