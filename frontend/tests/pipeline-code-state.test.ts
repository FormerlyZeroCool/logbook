import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exploreSource = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');

test('Explore keeps source canonical and derives Pipeline only on demand', () => {
  assert.match(exploreSource, /const sourceBody = code;/);
  assert.match(exploreSource, /openPipelineSession\(sourceBodyRef\.current, bindingKinds\)/);
  assert.match(exploreSource, /onChange=\{changePipeline\}/);
  assert.match(exploreSource, /const nextSource = sourceFromPipelineEdit\(nextPipeline\)/);
  assert.doesNotMatch(exploreSource, /mode === 'pipeline'\s*\?\s*generateProgramBody/);
  assert.doesNotMatch(exploreSource, /if \(mode === 'pipeline'\) setCode\(sourceBody\)/);
});
