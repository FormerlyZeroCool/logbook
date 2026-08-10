import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  analysisFunctionIdentifier,
  createAnalysisFunctionFactoryTemplate,
  createAnalysisFunctionTemplate,
  analysisFunctionValidationReference,
  inferAnalysisFunction,
  inferAnalysisFunctionKind,
  inferPipelineContext,
  analysisFunctionPropertyIdentifier,
  buildProgramSourceDocument,
  compileAnalysisProgram,
  extractAnalysisBody,
  generateFunctionBindingDeclarations,
  generateProgramBody,
} from './index.js';

describe('TypeScript analysis authoring', () => {
  it('builds and extracts the generated typed transform document', () => {
    const body = "const values: NumericSeries = event.values();\nreturn values;";
    const document = buildProgramSourceDocument(body, ['event']);
    expect(document.text).toContain('event: EventSeries');
    expect(document.text).toContain('context: AnalysisContext');
    expect(extractAnalysisBody(document.text)).toBe(body);
  });

  it('compiles valid strict TypeScript to runnable JavaScript', () => {
    const result = compileAnalysisProgram({
      sourceBody: "const values: NumericSeries = event.values();\nreturn values.withLabel('Value');",
      inputAliases: ['event'],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('function transform');
    expect(result.javascript).not.toContain(': NumericSeries');
  });


  it('allows numeric, string, and null scalar results at the top level', () => {
    for (const sourceBody of ['return 42;', 'return "forty two";', 'return null;']) {
      const result = compileAnalysisProgram({ sourceBody, inputAliases: ['event'], semantic: true });
      expect(result.diagnostics).toEqual([]);
      expect(result.javascript).not.toBeNull();
    }
  });

  it('rejects semantic type errors before execution', () => {
    const result = compileAnalysisProgram({
      sourceBody: "const values: string = event.values();\nreturn values;",
      inputAliases: ['event'],
      semantic: true,
    });
    expect(result.javascript).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith('typescript_'))).toBe(true);
  });

  it('does not expose browser or network globals', () => {
    const result = compileAnalysisProgram({ sourceBody: 'return fetch("https://example.com");', inputAliases: ['event'], semantic: true });
    expect(result.javascript).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('never') || diagnostic.message.includes('callable'))).toBe(true);
  });

  it('normalizes legacy separators to underscore-only public properties', () => {
    expect(analysisFunctionPropertyIdentifier('replace_null_with_zero')).toBe('replace_null_with_zero');
    expect(analysisFunctionPropertyIdentifier('replace-null-with-zero')).toBe('replace_null_with_zero');
    expect(analysisFunctionPropertyIdentifier('replace-null-with-zero')).not.toContain('$');
    expect(analysisFunctionIdentifier('replace_null_with_zero')).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
  });

  it('types and emits nested udf collections with return-inferred map callbacks', () => {
    const alias = analysisFunctionIdentifier('normalize');
    const result = compileAnalysisProgram({
      sourceBody: 'return event.values().map(udf.mappers.normalize);',
      inputAliases: ['event'],
      functionBindings: [{
        functionKey: 'normalize',
        alias,
        functionKind: 'point-map',
        sourceBody: 'return point.withValue((value ?? 0) * 2);',
      }],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('const udf = Object.freeze');
    expect(result.javascript).toContain('mappers: Object.freeze');
    expect(result.javascript).toContain('.map');
  });

  it('enforces point, boolean, scalar, and window-transform return contracts', () => {
    const mapper = compileAnalysisProgram({
      sourceBody: 'return event.values();', inputAliases: ['event'], semantic: true,
      functionBindings: [{ alias: 'fn_bad_mapper', functionKey: 'bad_mapper', functionKind: 'point-map', sourceBody: 'return 2;' }],
    });
    expect(mapper.javascript).toBeNull();

    const filter = compileAnalysisProgram({
      sourceBody: 'return event.values();', inputAliases: ['event'], semantic: true,
      functionBindings: [{ alias: 'fn_bad_filter', functionKey: 'bad_filter', functionKind: 'point-filter', sourceBody: 'return point;' }],
    });
    expect(filter.javascript).toBeNull();

    const reducer = compileAnalysisProgram({
      sourceBody: 'return event.values();', inputAliases: ['event'], semantic: true,
      functionBindings: [{ alias: 'fn_bad_reducer', functionKey: 'bad_reducer', functionKind: 'reducer', sourceBody: 'return { invalid: true };' }],
    });
    expect(reducer.javascript).toBeNull();

    const stringReducer = compileAnalysisProgram({
      sourceBody: 'return event.values().reduce(udf.reducers.describe);', inputAliases: ['event'], semantic: true,
      functionBindings: [{ alias: 'fn_describe', functionKey: 'describe', functionKind: 'reducer', sourceBody: 'return values.some((value) => value !== null) ? \"has values\" : \"empty\";' }],
    });
    expect(stringReducer.diagnostics).toEqual([]);

    const mapFilter = compileAnalysisProgram({
      sourceBody: 'return event.values().mapFilter(udf.map_filters.keep_positive);',
      inputAliases: ['event'],
      semantic: true,
      functionBindings: [{
        alias: 'fn_keep_positive', functionKey: 'keep_positive', functionKind: 'map-filter',
        sourceBody: 'return value !== null && value > 0 ? point.withValue(value * 2) : null;',
      }],
    });
    expect(mapFilter.diagnostics).toEqual([]);

    const windowTransform = compileAnalysisProgram({
      sourceBody: 'return event.values().transformWindow(udf.window_transforms.trailing_mean, 4);',
      inputAliases: ['event'],
      semantic: true,
      functionBindings: [{
        alias: 'fn_trailing_mean', functionKey: 'trailing_mean', functionKind: 'window-transform',
        sourceBody: 'const valid = window.validValues(); return window.anchorPoint.withValue(valid.length ? valid[0]! : null);',
      }],
    });
    expect(windowTransform.diagnostics).toEqual([]);
  });


  it('infers UDF categories from the complete signature rather than the selected template', () => {
    const mapper = createAnalysisFunctionTemplate('point-map', 'candidate');
    expect(inferAnalysisFunctionKind(mapper)).toBe('point-map');

    const changedToFilter = mapper
      .replace('): NumericPoint', '): boolean')
      .replace('return point;', 'return value !== null;');
    expect(inferAnalysisFunctionKind(changedToFilter)).toBe('point-filter');

    const changedToMapFilter = changedToFilter
      .replace('): boolean', '): NumericPoint | null')
      .replace('return value !== null;', 'return value === null ? null : point.withValue(value * 2);');
    expect(inferAnalysisFunctionKind(changedToMapFilter)).toBe('map-filter');

    const mapFilterTemplate = createAnalysisFunctionTemplate('map-filter', 'map_filter_candidate');
    expect(mapFilterTemplate).toContain('): NumericPoint | null');
    expect(mapFilterTemplate).toContain('return value === null ? null : point;');
    expect(inferAnalysisFunctionKind(mapFilterTemplate)).toBe('map-filter');

    const windowTransform = createAnalysisFunctionTemplate('window-transform', 'window_candidate');
    expect(windowTransform).toContain('windowSize: number');
    expect(windowTransform).toContain('): NumericPoint');
    expect(inferAnalysisFunctionKind(windowTransform)).toBe('window-transform');


    const stringReducer = createAnalysisFunctionTemplate('reducer', 'describe_candidate')
      .replace('return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : 0;', 'return valid.length ? "has values" : "empty";');
    expect(stringReducer).toContain('): number | string | null');
    expect(inferAnalysisFunctionKind(stringReducer)).toBe('reducer');
  });

  it('keeps the ergonomic non-null inline map callback', () => {
    const result = compileAnalysisProgram({
      sourceBody: 'return event.values().map((value, point, index, context) => point.withValue((value ?? 0) * 1000));',
      inputAliases: ['event'],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('point.withValue');
  });

  it('type-checks every NumericSeries higher-order function against its inferred udf collection', () => {
    const bindings = [
      { alias: 'fn_mapper', functionKey: 'mapper', functionKind: 'point-map' as const, sourceBody: 'return point.withValue(value === null ? 0 : value * 2);' },
      { alias: 'fn_filter', functionKey: 'filter', functionKind: 'point-filter' as const, sourceBody: 'return value !== null;' },
      { alias: 'fn_map_filter', functionKey: 'map_filter', functionKind: 'map-filter' as const, sourceBody: 'return value === null ? null : point.withValue(value);' },
      { alias: 'fn_window', functionKey: 'window', functionKind: 'window-transform' as const, sourceBody: 'return window.anchorPoint.withValue(window.validValues()[0] ?? null);' },
      { alias: 'fn_reducer', functionKey: 'reducer', functionKind: 'reducer' as const, sourceBody: 'return values.find((value): value is number => value !== null) ?? null;' },
    ];
    for (const sourceBody of [
      'return event.values().map(udf.mappers.mapper);',
      'return event.values().filter(udf.filters.filter);',
      'return event.values().mapFilter(udf.map_filters.map_filter);',
      'return event.values().transformWindow(udf.window_transforms.window, 3);',
      'return event.values().windowedMap(udf.window_transforms.window, 3);',
      'return event.values().windowed_map(udf.window_transforms.window, 3);',
      'return event.values().reduce(udf.reducers.reducer);',
    ]) {
      const result = compileAnalysisProgram({ sourceBody, inputAliases: ['event'], functionBindings: bindings, semantic: true });
      expect(result.diagnostics).toEqual([]);
    }
  });


  it('rejects obsolete mapper signatures instead of rewriting them', () => {
    const pointFirst = `function old_mapper(
  point: NumericPoint,
  index: number,
  context: AnalysisContext,
): NumericPoint {
  void index;
  void context;
  return point;
}`;
    const optionsBag = `function old_mapper(
  value: number | null,
  point: NumericPoint,
  index: number,
  options: AnalysisOptions,
  context: AnalysisContext,
): NumericPoint {
  void value;
  void index;
  void options;
  void context;
  return point;
}`;

    expect(inferAnalysisFunctionKind(pointFirst)).toBeNull();
    expect(inferAnalysisFunctionKind(optionsBag)).toBeNull();

    const bodyOnly = compileAnalysisProgram({
      sourceBody: 'return event.values().map(udf.mappers.old_mapper);',
      inputAliases: ['event'],
      functionBindings: [{
        alias: 'fn_old_mapper',
        functionKey: 'old_mapper',
        functionKind: 'point-map',
        sourceBody: 'return point.withValue(value === null ? null : value * Number(options.factor ?? 1));',
      }],
      semantic: true,
    });
    expect(bodyOnly.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });

  it('generates one ambient typed udf object for the editor library', () => {
    const declarations = generateFunctionBindingDeclarations([
      { functionKey: 'scale', alias: 'fn_scale', functionKind: 'point-map' },
      { functionKey: 'positive_only', alias: 'fn_positive_only', functionKind: 'point-filter' },
      { functionKey: 'mean', alias: 'fn_mean', functionKind: 'reducer' },
      { functionKey: 'trailing_mean', alias: 'fn_trailing_mean', functionKind: 'window-transform' },
      { functionKey: 'normalize_invalid', alias: 'fn_normalize_invalid', functionKind: 'map-filter' },
      { functionKey: 'smooth_series', alias: 'fn_smooth_series', functionKind: 'series-transform' },
    ]);
    expect(declarations).toContain('declare const udf: Readonly<{');
    expect(declarations).toContain('readonly mappers: Readonly<{');
    expect(declarations).toContain('readonly filters: Readonly<{');
    expect(declarations).toContain('readonly reducers: Readonly<{');
    expect(declarations).toContain('readonly window_transforms: Readonly<{');
    expect(declarations).toContain('readonly map_filters: Readonly<{');
    expect(declarations).toContain('readonly series_transforms: Readonly<{');
    expect(declarations).toContain('readonly scale: typeof fn_scale;');
    expect(declarations).not.toContain('$');
    expect(declarations).not.toContain('const udf = Object.freeze');
  });

  it('offers categories after udf. and functions after udf.mappers.', () => {
    const generated = generateFunctionBindingDeclarations([
      { functionKey: 'normalize', alias: 'fn_normalize', functionKind: 'point-map' },
      { functionKey: 'replace_null_with_zero', alias: 'fn_replace_null_with_zero', functionKind: 'point-map' },
      { functionKey: 'positive_only', alias: 'fn_positive_only', functionKind: 'point-filter' },
    ]);
    const source = [
      'type NumericPoint = { value: number | null };',
      'type EventRecord = unknown;',
      'type AnalysisOptions = Record<string, unknown>;',
      'type AnalysisContext = unknown;',
      'type MapFilterResult = unknown;',
      'type NumericSeries = unknown;',
      'type AnalysisResult = unknown;',
      generated,
      'function transform() { udf.; udf.mappers.; }',
    ].join('\n');
    const fileName = '/udf-completion.ts';
    const files = new Map<string, string>([[fileName, source]]);
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, strict: true };
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [fileName],
      getScriptVersion: () => '1',
      getScriptSnapshot: (candidate) => {
        const text = files.get(candidate) ?? ts.sys.readFile(candidate);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => options,
      getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
      fileExists: (candidate) => files.has(candidate) || ts.sys.fileExists(candidate),
      readFile: (candidate) => files.get(candidate) ?? ts.sys.readFile(candidate),
      readDirectory: ts.sys.readDirectory,
    };
    const service = ts.createLanguageService(host);
    const udfPosition = source.indexOf('udf.') + 'udf.'.length;
    const mapperPosition = source.lastIndexOf('udf.mappers.') + 'udf.mappers.'.length;
    const categories = service.getCompletionsAtPosition(fileName, udfPosition, {})?.entries.map((entry) => entry.name) ?? [];
    const mappers = service.getCompletionsAtPosition(fileName, mapperPosition, {})?.entries.map((entry) => entry.name) ?? [];
    expect(categories).toEqual(expect.arrayContaining(['mappers', 'filters', 'reducers', 'window_transforms']));
    expect(mappers).toEqual(expect.arrayContaining(['normalize', 'replace_null_with_zero']));
    expect(mappers).not.toContain('positive_only');
  });

  it('generates inferred map calls for point-map visual pipeline steps', () => {
    const body = generateProgramBody({
      schemaVersion: 1,
      inputAlias: 'event',
      steps: [
        { operation: 'values' },
        { operation: 'map', functionBinding: 'scale', arguments: [2] },
      ],
      outputType: 'NumericSeries',
      queryContext: { mode: 'derived', rowsBefore: 0, rowsAfter: 0, exact: true },
    });
    expect(body).toContain('.map(udf.mappers.scale(2))');
  });

  it('infers typed factories from their returned callback type and preserves their parameter declarations', () => {
    const clampSource = `function clamp(min: number, max: number): NumericMapper {
      return (value, point, index, context): NumericPoint => value === null
        ? point
        : point.withValue(Math.min(max, Math.max(min, value)));
    }`;
    expect(inferAnalysisFunction(clampSource)).toEqual({
      functionKind: 'point-map',
      functionName: 'clamp',
      mode: 'factory',
    });
    expect(analysisFunctionValidationReference(clampSource, 'fn_clamp')).toBe('fn_clamp(0, 0)');
    const declarations = generateFunctionBindingDeclarations([{
      functionKey: 'clamp',
      alias: 'fn_clamp',
      functionKind: 'point-map',
      sourceBody: clampSource,
    }]);
    expect(declarations).toContain('declare function fn_clamp(min: number, max: number): NumericMapper;');
    expect(declarations).toContain('readonly clamp: typeof fn_clamp;');
  });

  it('type-checks curried mapper factories with positional and inline named parameters', () => {
    const bindings = [
      {
        alias: 'fn_clamp', functionKey: 'clamp', functionKind: 'point-map' as const,
        sourceBody: 'function clamp(min: number, max: number): NumericMapper { return (value, point) => value === null ? point : point.withValue(Math.min(max, Math.max(min, value))); }',
      },
      {
        alias: 'fn_normalize', functionKey: 'normalize', functionKind: 'point-map' as const,
        sourceBody: 'function normalize(config: { input_min: number; input_max: number; output_min?: number; output_max?: number }): NumericMapper { return (value, point) => point.withValue(value); }',
      },
    ];
    const result = compileAnalysisProgram({
      sourceBody: 'return event.values().map(udf.mappers.clamp(0, 100), context).map(udf.mappers.normalize({ input_min: 0, input_max: 100 }), context);',
      inputAliases: ['event'],
      functionBindings: bindings,
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('does not infer factory signatures that rely on unresolved user-defined configuration types', () => {
    expect(inferAnalysisFunctionKind('function normalize(config: NormalizeOptions): NumericMapper { return (value, point) => point; }')).toBeNull();
  });


  it('creates typed factory templates for every reusable function category', () => {
    const expectations: Array<[Parameters<typeof createAnalysisFunctionFactoryTemplate>[0], string]> = [
      ['event-filter', 'EventPredicate'],
      ['point-map', 'NumericMapper'],
      ['point-filter', 'NumericPredicate'],
      ['map-filter', 'NumericMapFilter'],
      ['window-transform', 'WindowTransformer'],
      ['reducer', 'SeriesReducer'],
      ['series-transform', 'SeriesTransformer'],
    ];
    for (const [kind, callbackType] of expectations) {
      const source = createAnalysisFunctionFactoryTemplate(kind, `factory_${kind.replaceAll('-', '_')}`);
      expect(source).toContain(`): ${callbackType}`);
      expect(source).not.toContain('AnalysisOptions');
      expect(inferAnalysisFunction(source)).toMatchObject({ functionKind: kind, mode: 'factory' });
    }
  });

  it('keeps direct templates options-free', () => {
    const direct = createAnalysisFunctionTemplate('point-map', 'direct_mapper');
    expect(direct).not.toContain('AnalysisOptions');
    expect(inferAnalysisFunction(direct)).toMatchObject({ functionKind: 'point-map', mode: 'direct' });

  });


  it('keeps UDF factory arguments separate from transform-window operation context', () => {
    const context = inferPipelineContext('EventSeries', [
      { operation: 'values' },
      {
        operation: 'transformWindow',
        functionBinding: 'configured_window',
        arguments: [{ minimum_points: 2 }],
        windowSize: 4,
        options: { alignment: 'centered' },
      },
    ]);
    expect(context).toEqual({ rowsBefore: 1, rowsAfter: 2, exact: true });
  });

});
