import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const packageRoot = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function sourceFiles(directory: string): string[] {
  const root = new URL(`../${directory}`, import.meta.url).pathname;
  const output: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(?:ts|tsx)$/.test(path)) output.push(relative(packageRoot.pathname, path));
    }
  };
  visit(root);
  return output;
}

test('the package owns Monaco and TypeScript worker setup', () => {
  const environment = read('src/monaco/create-monaco-environment.ts');
  const languageService = read('src/monaco/configure-typescript.ts');
  assert.match(environment, /typescript\/ts\.worker\?worker/);
  assert.match(environment, /reference path=\"\.\.\/worker-imports\.d\.ts\"/);
  assert.match(environment, /ensureAnalysisMonacoEnvironment/);
  assert.match(languageService, /strict: true/);
  assert.match(languageService, /setDiagnosticsOptions/);
  assert.match(languageService, /ANALYSIS_SDK_DECLARATIONS/);
});

test('the public API exposes generic and analysis-specific adapters', () => {
  const index = read('src/index.ts');
  assert.match(index, /AnalysisTypeScriptEditor/);
  assert.match(index, /AnalysisProgramEditor/);
  assert.match(index, /AnalysisFunctionEditor/);
  assert.match(index, /createProgramEditorDocument/);
  assert.match(
    read('src/document-adapters.ts'),
    /export function createProgramEditorDocument/,
  );
  assert.match(
    read('src/document-adapters.ts'),
    /export function createFunctionEditorDocument/,
  );
  assert.match(read('src/document-adapters.ts'), /extraLibraries:/);
  assert.match(read('src/document-adapters.ts'), /generatedDeclarations:/);
});

test('package source has no frontend application imports', () => {
  for (const path of sourceFiles('src')) {
    const source = read(path);
    assert.doesNotMatch(source, /frontend\/src|\.\.\/\.\.\/frontend|from ['"][^'"]*pages\//, path);
  }
});

test('Monaco configuration uses APIs supported by the pinned editor version', () => {
  const languageService = read('src/monaco/configure-typescript.ts');
  const editor = read('src/AnalysisTypeScriptEditor.tsx');
  assert.match(languageService, /ScriptTarget\.ESNext/);
  assert.doesNotMatch(languageService, /ScriptTarget\.ES2023/);
  assert.doesNotMatch(editor, /semanticHighlighting/);
});
