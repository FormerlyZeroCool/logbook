import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Explore has a standalone-session launcher and saved-session list', () => {
  const app = read('src/App.tsx');
  const home = read('src/pages/ExploreHomePage.tsx');
  assert.match(app, /path="\/explore\/new"/);
  assert.match(home, /New standalone session/);
  assert.match(home, /listExplorations/);
});

test('session UDFs use the shared TypeScript editor and run before promotion', () => {
  const workbench = read('src/analysis/editor/SessionFunctionWorkbench.tsx');
  const explore = read('src/pages/ExplorePage.tsx');
  assert.match(workbench, /AnalysisFunctionEditor/);
  assert.match(workbench, /Save to function library/);
  assert.match(explore, /localFunctions\.find/);
  assert.match(explore, /sourceBody: local\.sourceBody/);
});

test('workspace persistence allows local UDFs but immutable revisions require library revisions', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  assert.match(explore, /Save workspace/);
  assert.match(explore, /Save revision/);
  assert.match(explore, /editorPreferences/);
});
