import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path: string) => existsSync(new URL(`../${path}`, import.meta.url));

test('the frontend consumes the monorepo editor package instead of owning Monaco setup', () => {
  const frontendPackage = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
  const main = read('src/main.tsx');
  const explore = read('src/pages/ExplorePage.tsx');
  const functions = read('src/pages/AnalysisFunctionPage.tsx');
  const vite = read('vite.config.ts');

  assert.equal(frontendPackage.dependencies['@logbook/analysis-editor'], '1.0.0');
  assert.equal(frontendPackage.dependencies['@monaco-editor/react'], undefined);
  assert.equal(frontendPackage.dependencies['monaco-editor'], undefined);
  assert.match(main, /@logbook\/analysis-editor\/styles\.css/);
  assert.match(explore, /AnalysisProgramEditor/);
  assert.match(functions, /AnalysisFunctionEditor/);
  assert.equal(exists('src/monaco.ts'), false);
  assert.equal(exists('src/analysis/editor/AnalysisCodeEditor.tsx'), false);
  assert.doesNotMatch(vite, /monaco-editor|@monaco-editor/);
});

test('type errors still block Explore execution through the package callback', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  assert.match(explore, /onTypeDiagnosticsChange=\{setEditorDiagnostics\}/);
  assert.match(explore, /sourceDiagnostics\.some/);
});
