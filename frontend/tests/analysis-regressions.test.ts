import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the frontend does not own Monaco or analysis SDK compiler configuration', () => {
  const packageJson = read('package.json');
  assert.doesNotMatch(packageJson, /monaco-editor/);
  assert.match(packageJson, /@logbook\/analysis-editor/);
});
