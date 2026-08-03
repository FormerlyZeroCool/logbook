import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('generated UDF declarations are loaded as an extra library, never inserted into the Monaco model', () => {
  const editor = read('src/AnalysisTypeScriptEditor.tsx');
  const adapters = read('src/document-adapters.ts');

  assert.match(editor, /Show generated declarations/);
  assert.match(editor, /data-editor-schema=\"v13\"/);
  assert.match(editor, /document\.generatedDeclarations/);
  assert.match(editor, /Generated UDF declarations/);
  assert.match(editor, /documentVersion = stableHash\(document\.key\)/);
  assert.match(editor, /path = `file:\/\/\/logbook-analysis\/\$\{sanitizeModelKey/);
  assert.doesNotMatch(editor, /setHiddenAreas/);
  assert.doesNotMatch(editor, /hiddenGeneratedRanges/);

  assert.match(adapters, /build: \(sourceBody\) => buildProgramSourceDocument/);
  assert.match(adapters, /extraLibraries: \[\{/);
  assert.match(adapters, /udf-\$\{declarationHash\}\.d\.ts/);
  assert.match(adapters, /generatedDeclarations: declarations/);
  assert.match(adapters, /program-v13:/);
  assert.doesNotMatch(adapters, /export \{\};/);
  assert.doesNotMatch(adapters, /prependGeneratedModuleScope/);
});

test('function signatures stay visible and are persisted for UDF documents', () => {
  const editor = read('src/AnalysisTypeScriptEditor.tsx');
  const adapters = read('src/document-adapters.ts');
  assert.match(editor, /monaco\.KeyCode\.KeyA/);
  assert.match(editor, /currentDocument\.bodyStartLine/);
  assert.match(editor, /currentDocument\.bodyEndLine/);
  assert.match(editor, /lineNumbers: 'on'/);
  assert.match(adapters, /extractEditableFunctionSource/);
  assert.match(adapters, /isCompleteAnalysisFunctionSource/);
  assert.match(adapters, /function-signature-v13:/);
});

test('program editor document identity includes the public udf key and kind', () => {
  const programEditor = read('src/AnalysisProgramEditor.tsx');
  assert.match(programEditor, /binding\.functionKey \?\? binding\.alias/);
  assert.match(programEditor, /binding\.functionKind/);
});

test('the editor library declares one nested typed udf object', () => {
  const declarations = read('../analysis-sdk/src/typescript/type-declarations.ts');
  assert.match(declarations, /declare const udf: Readonly<\{/);
  for (const collection of ['mappers', 'filters', 'reducers', 'window_transforms', 'map_filters', 'series_transforms']) {
    assert.match(declarations, new RegExp(`collectionDeclaration\\('${collection}'\\)`));
  }
  assert.doesNotMatch(declarations, /const udf = Object\.freeze\(\{/);
  assert.match(declarations, /analysisFunctionPropertyIdentifier/);
});
