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
  assert.match(css, /\.analysis-workspace-section/);
});

test('every listed function is exposed through the nested udf object and best saved revision', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  const catalog = read('src/analysis/editor/FunctionBindingEditor.tsx');
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const compiler = read('../packages/analysis-sdk/src/typescript/compiler.ts');

  assert.match(explore, /const editorFunctionBindings = useMemo\(\(\) => functionCatalog\.map/);
  assert.match(explore, /functionBindings=\{editorFunctionBindings\}/);
  assert.doesNotMatch(explore, /functionCatalog\.filter\(hasSavedRevision\)/);
  assert.match(explore, /published_revision_id\s*\?\?\s*item\.draft_revision_id/);
  assert.match(explore, /detail\.revisions\?\.\[0\]/);
  assert.match(explore, /listed in udf but has no saved revision to execute/);
  assert.match(catalog, /analysisFunctionReference/);
  assert.match(catalog, /udf\.mappers\.scale/);
  assert.match(catalog, /udf\.window_transforms\.trailing_mean/);
  assert.match(declarations, /declare const udf: Readonly<\{/);
  assert.match(compiler, /const udf = Object\.freeze/);
  for (const collection of ['mappers', 'filters', 'reducers', 'window_transforms', 'map_filters', 'series_transforms']) {
    assert.match(declarations, new RegExp(`collectionDeclaration\\('${collection}'\\)`));
    assert.match(compiler, new RegExp(`collectionSource\\('${collection}'\\)`));
  }
});

test('function keys are underscore-only and legacy hyphens are migrated without dollar aliases', () => {
  const routes = read('../backend/src/routes/analysis.ts');
  const functionsPage = read('src/pages/AnalysisFunctionsPage.tsx');
  const sessionEditor = read('src/analysis/editor/SessionFunctionWorkbench.tsx');
  const sourceDocuments = read('../packages/analysis-sdk/src/typescript/source-documents.ts');
  const migration = read('../backend/migrations/004_analysis_udf_namespaces.sql');

  assert.match(routes, /\^\[a-z\]\[a-z0-9_\]\{0,63\}\$/);
  assert.match(functionsPage, /placeholder="stable_key"/);
  assert.match(functionsPage, /\[\^a-z0-9_\]/);
  assert.match(sessionEditor, /\[\^a-z0-9_\]/);
  assert.match(sourceDocuments, /replace\(\/\[\^A-Za-z0-9_\]\//);
  assert.match(sourceDocuments, /const normalized = functionKey\.replace\(\/\[\^A-Za-z0-9_\]\/g, '_'\)/);
  assert.match(migration, /replace\(item\.function_key, '-', '_'\)/);
  assert.match(migration, /CHECK \(function_key ~ '\^\[a-z\]\[a-z0-9_\]\{0,63\}\$'\)/);
});

test('saved function contracts are inferred from editable signatures and window transforms return points', () => {
  const sourceDocuments = read('../packages/analysis-sdk/src/typescript/source-documents.ts');
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const routes = read('../backend/src/routes/analysis.ts');
  const functionPage = read('src/pages/AnalysisFunctionPage.tsx');
  const sessionEditor = read('src/analysis/editor/SessionFunctionWorkbench.tsx');
  const codegen = read('../packages/analysis-sdk/src/pipeline/codegen.ts');

  assert.match(sourceDocuments, /case 'point-map':[\s\S]*?returnType: 'NumericPoint'/);
  assert.match(sourceDocuments, /case 'point-filter':[\s\S]*?returnType: 'boolean'/);
  assert.match(sourceDocuments, /case 'reducer':[\s\S]*?returnType: 'number \| string \| null'/);
  assert.match(sourceDocuments, /case 'window-transform':[\s\S]*?'windowSize: number'[\s\S]*?returnType: 'NumericPoint'/);
  assert.match(declarations, /type SeriesReducer =[\s\S]*?=> number \| string \| null;/);
  assert.match(routes, /case 'point-map':[\s\S]*?\.map\(/);
  assert.match(routes, /inferAnalysisFunction/);
  assert.match(routes, /unsupported_function_signature/);
  assert.match(functionPage, /inferAnalysisFunctionKind/);
  assert.match(functionPage, /Function signature and body/);
  assert.match(sessionEditor, /createAnalysisFunctionTemplate/);
  assert.match(sessionEditor, /inferAnalysisFunctionKind/);
  assert.match(codegen, /step\.operation === 'mapPoints' && step\.functionBinding[\s\S]*?\? 'map'/);
});

test('NumericPoint or null return signatures infer map_filters and null drops the row', () => {
  const signatures = read('../packages/analysis-sdk/src/typescript/function-signatures.ts');
  const sourceDocuments = read('../packages/analysis-sdk/src/typescript/source-documents.ts');
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const hostSeries = read('../packages/analysis-sdk/src/sdk/NumericSeries.ts');
  const guestRuntime = read('../packages/analysis-sdk/src/runtime/bootstrap.ts');
  const functionsPage = read('src/pages/AnalysisFunctionsPage.tsx');

  assert.match(signatures, /isNumericPointOrNull/);
  assert.match(signatures, /isNumericPointOrNull\(returnType\)[\s\S]*?functionKind: 'map-filter'/);
  assert.match(sourceDocuments, /case 'map-filter':[\s\S]*?returnType: 'NumericPoint \| null'/);
  assert.match(sourceDocuments, /'map-filter': 'return value === null \? null : point;'/);
  assert.match(declarations, /type NumericMapFilter =[\s\S]*?=> NumericPoint \| null/);
  assert.match(hostSeries, /if \(result === null\) return;/);
  assert.match(hostSeries, /result instanceof NumericPoint/);
  assert.match(guestRuntime, /result === null/);
  assert.match(functionsPage, /Point\/value → NumericPoint \| null/);
});

test('UDF creation uses template buttons but saved category follows the edited signature', () => {
  const functionsPage = read('src/pages/AnalysisFunctionsPage.tsx');
  const sessionEditor = read('src/analysis/editor/SessionFunctionWorkbench.tsx');
  const signatures = read('../packages/analysis-sdk/src/typescript/function-signatures.ts');
  const repository = read('../backend/src/analysis/repository.ts');

  for (const label of ['Mapper', 'Filter', 'Reducer', 'Window transform']) assert.match(functionsPage, new RegExp(`label: '${label}'`));
  for (const label of ['New mapper', 'New filter', 'New reducer', 'New window transform', 'New mapper factory', 'New reducer factory']) assert.match(sessionEditor, new RegExp(label));
  assert.doesNotMatch(sessionEditor, /<label>Kind<select/);
  assert.match(signatures, /inferDirectKind/);
  assert.match(signatures, /parameters\[0\] === 'NumericWindow'/);
  assert.match(signatures, /parameters\[1\] === 'number'/);
  assert.match(signatures, /FACTORY_RETURN_KINDS/);
  assert.match(signatures, /NumericMapper: 'point-map'/);
  assert.match(repository, /draft_revision_id=\$2,function_kind=CASE WHEN published_revision_id IS NULL THEN \$3/);
  assert.match(repository, /output_metadata->>'inferredFunctionKind'/);
});

test('generated declarations stay outside the editable Monaco model while signatures remain visible', () => {
  const editor = readPackage('src/AnalysisTypeScriptEditor.tsx');
  const adapters = readPackage('src/document-adapters.ts');

  assert.match(editor, /Show generated declarations/);
  assert.match(editor, /data-editor-schema=\"v15\"/);
  assert.match(editor, /data-generated-declarations/);
  assert.match(editor, /document\.generatedDeclarations/);
  assert.match(editor, /Generated UDF declarations/);
  assert.match(editor, /documentVersion = stableHash\(document\.key\)/);
  assert.doesNotMatch(editor, /setHiddenAreas/);
  assert.doesNotMatch(editor, /hiddenGeneratedRanges/);
  assert.match(editor, /monaco\.KeyCode\.KeyA/);
  assert.match(adapters, /extraLibraries: \[\{/);
  assert.match(adapters, /build: \(sourceBody\) => buildProgramSourceDocument/);
  assert.match(adapters, /program-v15:/);
  assert.doesNotMatch(adapters, /export \{\};/);
});

test('Plot, Transformation, Reusable functions, and Validation are independently collapsible in that order', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  const plot = explore.indexOf('<span>Plot</span>');
  const transform = explore.indexOf('<span>Transformation</span>');
  const functions = explore.indexOf('<span>Reusable functions</span>');
  const validation = explore.indexOf('<span>Validation</span>');
  assert.ok(plot >= 0 && plot < transform && transform < functions && functions < validation);
  assert.match(explore, /<details className="analysis-panel analysis-workspace-section" open>/);
  assert.match(explore, /<summary className="analysis-section-summary">/);
});

test('map preserves complete points and all NumericSeries higher-order functions keep strict contracts', () => {
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const signatures = read('../packages/analysis-sdk/src/typescript/function-signatures.ts');
  const sourceDocuments = read('../packages/analysis-sdk/src/typescript/source-documents.ts');
  const hostSeries = read('../packages/analysis-sdk/src/sdk/NumericSeries.ts');
  const guestRuntime = read('../packages/analysis-sdk/src/runtime/bootstrap.ts');
  const compiler = read('../packages/analysis-sdk/src/typescript/compiler.ts');

  assert.match(declarations, /type NumericValueMapper = \(value: number, point: NumericPoint/);
  assert.match(declarations, /type NumericMapper = \(value: number \| null, point: NumericPoint[\s\S]*?=> NumericPoint/);
  assert.match(declarations, /type NumericPointMapper = NumericMapper/);
  assert.match(declarations, /map\(mapper: NumericMapper/);
  assert.match(sourceDocuments, /case 'point-map':[\s\S]*?'value: number \| null'[\s\S]*?returnType: 'NumericPoint'/);
  assert.match(signatures, /parameters\.length === 4[\s\S]*?returnType === 'NumericPoint'[\s\S]*?functionKind: 'point-map'/);
  assert.doesNotMatch(compiler, /__logbookNumericMapperKind/);
  assert.match(hostSeries, /map must return a NumericPoint for every row/);
  assert.match(hostSeries, /mapValues\(mapper: ValueMapper/);
  assert.match(guestRuntime, /map must return a NumericPoint for every row/);
  assert.match(guestRuntime, /mapValues\(mapper: any/);
  for (const method of ['filter', 'mapFilter', 'transformWindow', 'windowedMap', 'windowed_map', 'reduce']) {
    assert.match(declarations, new RegExp(`\\b${method}\\(`));
  }
});

test('manual Run executes current source and map changes plotted values', () => {
  const explore = read('src/pages/ExplorePage.tsx');
  const hostSeries = read('../packages/analysis-sdk/src/sdk/NumericSeries.ts');
  const guestRuntime = read('../packages/analysis-sdk/src/runtime/bootstrap.ts');
  const renderer = read('src/analysis/renderer/SeriesResult.tsx');

  assert.match(explore, /sourceBody:\s*sourceBodyRef\.current/);
  assert.match(explore, /onSourceBodyChange=\{\(nextCode\) => \{ sourceBodyRef\.current = nextCode; setCode\(nextCode\); \}\}/);
  assert.doesNotMatch(explore, /sourceBody:\s*debouncedSource/);
  assert.match(hostSeries, /mapped instanceof NumericPoint/);
  assert.match(hostSeries, /return mapped/);
  assert.match(guestRuntime, /mapped instanceof NumericPoint/);
  assert.match(renderer, /data-analysis-values=\{serializedValues\}/);
});

test('production browser suite covers nested udf autocomplete, collapsible sections, graph output, and failure guards', () => {
  const browserTest = read('e2e/test_production_frontend.py');
  for (const signal of ['console', 'pageerror', 'requestfailed', 'response']) assert.match(browserTest, new RegExp(signal));
  for (const screenshot of ['existing-events-page.png', 'analysis-functions.png', 'analysis-function-edit.png', 'explore-map-points-output.png', 'explore-reducer-scalar-output.png']) {
    assert.match(browserTest, new RegExp(screenshot.replace('.', '\\.')));
  }
  assert.match(browserTest, /return point\.withValue/);
  assert.match(browserTest, /return udf\./);
  assert.match(browserTest, /return udf\.mappers\./);
  assert.match(browserTest, /map\(udf\.mappers/);
  assert.match(browserTest, /window_transforms/);
  assert.match(browserTest, /Inferred: map-filter/);
  assert.match(browserTest, /NumericPoint \| null/);
  assert.match(browserTest, /section did not collapse/);
  assert.match(browserTest, /for index, label in enumerate/);
  assert.match(browserTest, /point\.withValue\(\(value \?\? 0\) \* 1000\)/);
  assert.match(browserTest, /generated declarations must be hidden by default/i);

  const runner = read('../scripts/test-production-frontend.sh');
  assert.match(runner, /mcr\.microsoft\.com\/playwright\/python:v1\.54\.0-noble/);
  assert.match(runner, /docker run/);
  assert.doesNotMatch(runner, /pip install|python3? -m pip/);
});


test('numeric and string reducer results render as scalars in the Plot section', () => {
  const declarations = read('../packages/analysis-sdk/src/typescript/type-declarations.ts');
  const signatures = read('../packages/analysis-sdk/src/typescript/function-signatures.ts');
  const hostSeries = read('../packages/analysis-sdk/src/sdk/NumericSeries.ts');
  const guestRuntime = read('../packages/analysis-sdk/src/runtime/bootstrap.ts');
  const serializer = read('../packages/analysis-sdk/src/runtime/serialize-result.ts');
  const worker = read('src/analysis/worker/analysis.worker.ts');
  const validationWorker = read('../backend/src/analysis/validation-worker.ts');
  const renderer = read('src/analysis/renderer/ScalarResult.tsx');

  assert.match(declarations, /type AnalysisResult = number \| string \| null/);
  assert.match(declarations, /type SeriesReducer =[\s\S]*?number \| string \| null/);
  assert.match(signatures, /function isReducerResult/);
  assert.match(hostSeries, /typeof result !== 'string'/);
  assert.match(hostSeries, /typeof result === 'number' \? this\.unit : null/);
  assert.match(guestRuntime, /typeof result !== 'string'/);
  assert.match(serializer, /typeof result === 'number' \|\| typeof result === 'string' \|\| result === null/);
  assert.match(worker, /typeof result==='number'\|\|typeof result==='string'\|\|result===null/);
  assert.match(validationWorker, /typeof result === 'number' \|\| typeof result === 'string' \|\| result === null/);
  assert.match(renderer, /data-analysis-result-kind="scalar"/);
  assert.match(renderer, /data-analysis-scalar-value/);
});
