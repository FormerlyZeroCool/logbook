import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('only the generated udf object is hidden by default', () => {
  const editor = read('src/AnalysisTypeScriptEditor.tsx');
  const adapters = read('src/document-adapters.ts');

  assert.match(editor, /Show generated udf object/);
  assert.match(editor, /sourceDocument\.hiddenGeneratedRanges/);
  assert.match(editor, /setEditorHiddenAreas\(editor, showUdfDeclaration \? \[\] : hiddenUdfRanges\)/);
  assert.match(editor, /generatedDecorationRanges/);
  assert.match(editor, /data-udf-declaration=\{hasUdfDeclaration \? \(showUdfDeclaration \? 'visible' : 'hidden'\) : 'absent'\}/);
  assert.doesNotMatch(editor, /setEditorHiddenAreas\(editor, showUdfDeclaration \? \[\] : decorationRanges\)/);
  assert.doesNotMatch(editor, /editor\.setHiddenAreas/);

  assert.match(adapters, /line\.startsWith\('const udf = Object\.freeze\(\{'\)/);
  assert.match(adapters, /hiddenGeneratedRanges: \[hiddenUdfRange\]/);
  assert.doesNotMatch(adapters, /hiddenGeneratedRanges:.*bodyStartLine/s);
});

test('the generated function signature stays visible while Ctrl+A selects only the body', () => {
  const editor = read('src/AnalysisTypeScriptEditor.tsx');
  assert.match(editor, /monaco\.KeyCode\.KeyA/);
  assert.match(editor, /currentDocument\.bodyStartLine/);
  assert.match(editor, /currentDocument\.bodyEndLine/);
  assert.match(editor, /lineNumbers: 'on'/);
});

test('program editor document identity includes the public udf key', () => {
  const programEditor = read('src/AnalysisProgramEditor.tsx');
  assert.match(programEditor, /binding\.functionKey \?\? binding\.alias/);
});


test('the Monaco model receives a concrete inferred udf object', () => {
  const declarations = read('../analysis-sdk/src/typescript/type-declarations.ts');
  assert.match(declarations, /const udf = Object\.freeze\(\{/);
  assert.match(declarations, /analysisFunctionPropertyIdentifier/);
  assert.doesNotMatch(declarations, /declare const udf:/);
});
