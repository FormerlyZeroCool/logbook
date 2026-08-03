import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFromPipelineEdit, openPipelineSession } from '../src/analysis/editor/pipeline-code-sync.ts';

test('opening Pipeline derives IR without rewriting canonical source', () => {
  const source = `// Preserve this comment and formatting.\nreturn event.values().map(udf.mappers.clamp(0, 100));`;
  const opened = openPipelineSession(source, { clamp: 'point-map' });

  if (!opened.session) assert.fail('Expected source to open as a visual pipeline');
  const session = opened.session;
  assert.equal(session.sourceAtOpen, source);
  assert.deepEqual(session.definition.steps[1]?.arguments, [0, 100]);
});

test('a visual pipeline edit generates the new canonical source', () => {
  const source = 'return event.values();';
  const opened = openPipelineSession(source);
  if (!opened.session) assert.fail('Expected source to open as a visual pipeline');
  const session = opened.session;

  const nextDefinition = {
    ...session.definition,
    steps: [
      ...session.definition.steps,
      { operation: 'filterNulls' },
    ],
  };

  assert.equal(
    sourceFromPipelineEdit(nextDefinition),
    'return event\n  .values()\n  .filterNulls();',
  );
});

test('unsupported code cannot open Pipeline and is never regenerated', () => {
  const source = 'const values = event.values();\nreturn values;';
  const opened = openPipelineSession(source);
  assert.equal(opened.session, null);
  assert.equal(opened.diagnostics[0]?.code, 'pipeline_unrepresentable');
  assert.equal(source, 'const values = event.values();\nreturn values;');
});
