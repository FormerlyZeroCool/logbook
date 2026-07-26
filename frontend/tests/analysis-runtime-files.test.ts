import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('analysis worker uses QuickJS and host watchdog replacement', () => {
  assert.match(read('src/analysis/worker/analysis.worker.ts'), /getQuickJS/);
  assert.match(read('src/analysis/worker/analysis.worker.ts'), /compileAnalysisProgram/);
  assert.match(read('src/analysis/worker/worker-pool.ts'), /timeoutMs \+ 250/);
  assert.match(read('src/analysis/worker/worker-pool.ts'), /worker\.terminate\(\)/);
});
test('Explore keeps rolling two day and ten second behavior', () => {
  assert.match(read('src/analysis/explore-query.ts'), /2 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(read('src/pages/ExplorePage.tsx'), /10_000/);
});
