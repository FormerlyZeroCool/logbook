import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readPackage = (path: string): string => readFileSync(new URL(`../../packages/analysis-editor/${path}`, import.meta.url), 'utf8');

test('analysis routes remain inside the normal application Layout', () => {
  const app = read('src/App.tsx');
  const layoutStart = app.indexOf('<Layout>');
  const layoutEnd = app.indexOf('</Layout>');
  assert.ok(layoutStart >= 0 && layoutEnd > layoutStart);
  for (const route of ['/explore/new', '/analysis-functions', '/analysis-functions/:functionId']) {
    const routeIndex = app.indexOf(`path="${route}"`);
    assert.ok(routeIndex > layoutStart && routeIndex < layoutEnd, `${route} must render inside Layout`);
  }
});

test('analysis navigation is additive and keeps existing destinations', () => {
  const layout = read('src/components/Layout.tsx');
  for (const destination of ['/', '/events', '/kiosk', '/event-types', '/units', '/explore', '/analysis-functions']) {
    assert.match(layout, new RegExp(`to:\\s*['"]${destination.replace('/', '\\/')}['"]`));
  }
});

test('analysis CSS is scoped and does not reset Monaco or existing pages', () => {
  const css = read('src/analysis.css');
  assert.doesNotMatch(css, /@import\s+["']tailwindcss["']/);
  assert.doesNotMatch(css, /tailwindcss\/preflight/);
  assert.doesNotMatch(css, /(^|})\s*(input|button|select|textarea|body|html)\s*[{,]/m);
  assert.doesNotMatch(css, /\.monaco-editor\s+[a-z]/);
  assert.match(css, /\.analysis-panel/);
  assert.match(css, /\.logbook-analysis-editor/);
});

test('Explore declares every listed function in the udf object and resolves the best saved revision', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  const catalog = read('src/analysis/editor/FunctionBindingEditor.tsx');
  const programEditor = readPackage('src/AnalysisProgramEditor.tsx');

  assert.match(explore, /functionBindings=\{functionCatalog\.map/);
  assert.doesNotMatch(explore, /functionCatalog\.filter\(hasSavedRevision\)/);
  assert.match(explore, /functions\.isPending/);
  assert.match(explore, /Loading saved UDF declarations/);
  assert.match(explore, /published_revision_id\s*\?\?\s*item\.draft_revision_id/);
  assert.match(explore, /detail\.revisions\?\.\[0\]/);
  assert.match(explore, /is listed but has no saved revision to execute/);
  assert.match(catalog, /Every function shown here is a property/);
  assert.match(catalog, /analysisFunctionPropertyIdentifier/);
  assert.match(catalog, /functions\.map/);
  assert.match(catalog, /no saved revision/);
  assert.match(programEditor, /binding\.functionKey \?\? binding\.alias/);
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const compiler = read('../packages/analysis-sdk/src/typescript/compiler.ts');
  assert.match(declarations, /const udf = Object\.freeze\(\{/);
  assert.match(compiler, /analysisFunctionPropertyIdentifier/);
  assert.doesNotMatch(declarations, /declare const udf:/);
});

test('only the generated udf object is hidden while the function wrapper remains visible', () => {
  const editor = readPackage('src/AnalysisTypeScriptEditor.tsx');
  const adapters = readPackage('src/document-adapters.ts');
  const css = readPackage('src/styles.css');

  assert.match(editor, /useState\(false\)/);
  assert.match(editor, /Show generated udf object/);
  assert.match(editor, /sourceDocument\.hiddenGeneratedRanges/);
  assert.match(editor, /showUdfDeclaration \? \[\] : hiddenUdfRanges/);
  assert.match(editor, /generatedDecorationRanges/);
  assert.match(editor, /monaco\.KeyCode\.KeyA/);
  assert.match(editor, /lineNumbers: 'on'/);
  assert.doesNotMatch(editor, /showUdfDeclaration \? \[\] : decorationRanges/);
  assert.match(adapters, /const udf = Object\.freeze\(\{/);
  assert.match(adapters, /hiddenGeneratedRanges/);
  assert.match(css, /logbook-analysis-editor-generated-toggle/);
});

test('manual Run executes the current editor source and map changes plotted values', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  const hostSeries = read('../packages/analysis-sdk/src/sdk/NumericSeries.ts');
  const guestRuntime = read('../packages/analysis-sdk/src/runtime/bootstrap.ts');
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const renderer = read('src/analysis/renderer/SeriesResult.tsx');

  assert.match(explore, /sourceBody:\s*sourceBodyRef\.current/);
  assert.match(explore, /onSourceBodyChange=\{\(nextCode\) => \{ sourceBodyRef\.current = nextCode; setCode\(nextCode\); \}\}/);
  assert.doesNotMatch(explore, /sourceBody:\s*debouncedSource/);
  assert.match(hostSeries, /Mapper = \(value: number,/);
  assert.match(hostSeries, /point\.value === null[\s\S]*?\? point[\s\S]*?: point\.withValue/);
  assert.match(guestRuntime, /point\.value === null \? point : point\.withValue/);
  assert.match(declarations, /type NumericMapper = \(value: number,/);
  assert.match(renderer, /data-analysis-values=\{serializedValues\}/);
});

test('production browser suite fails on console and network errors and captures required screenshots', () => {
  const browserTest = read('e2e/test_production_frontend.py');
  for (const signal of ['console', 'pageerror', 'requestfailed', 'response']) assert.match(browserTest, new RegExp(signal));
  for (const screenshot of ['existing-events-page.png', 'analysis-functions.png', 'analysis-function-edit.png', 'explore-map-points-output.png']) {
    assert.match(browserTest, new RegExp(screenshot.replace('.', '\\.')));
  }
  assert.match(browserTest, /value \* 1000/);
  assert.match(browserTest, /data-analysis-values/);
  assert.match(browserTest, /monaco-hover/);
  assert.match(browserTest, /suggest-widget\.visible/);
  assert.match(browserTest, /generated udf object must be hidden by default/i);
  assert.match(browserTest, /saved_udf_key/);
  assert.match(browserTest, /Save revision/);
  assert.match(browserTest, /Publish/);

  const runner = read('../scripts/test-production-frontend.sh');
  assert.match(runner, /mcr\.microsoft\.com\/playwright\/python:v1\.54\.0-noble/);
  assert.match(runner, /docker run/);
  assert.doesNotMatch(runner, /pip install|python3? -m pip/);
});
