import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { analysisFunctionIdentifier, analysisFunctionPropertyIdentifier, buildProgramSourceDocument, compileAnalysisProgram, extractAnalysisBody, generateFunctionBindingDeclarations } from './index.js';

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
      semantic: true
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('function transform');
    expect(result.javascript).not.toContain(': NumericSeries');
  });

  it('rejects semantic type errors before execution', () => {
    const result = compileAnalysisProgram({
      sourceBody: "const values: string = event.values();\nreturn values;",
      inputAliases: ['event'],
      semantic: true
    });
    expect(result.javascript).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith('typescript_'))).toBe(true);
  });

  it('does not expose browser or network globals', () => {
    const result = compileAnalysisProgram({ sourceBody: 'return fetch("https://example.com");', inputAliases: ['event'], semantic: true });
    expect(result.javascript).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('never') || diagnostic.message.includes('callable'))).toBe(true);
  });

  it('creates valid distinct identifiers for reusable function keys', () => {
    const dashed = analysisFunctionIdentifier('replace-null-with-zero');
    const underscored = analysisFunctionIdentifier('replace_null_with_zero');
    expect(dashed).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
    expect(underscored).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
    expect(dashed).not.toBe(underscored);
  });
  it('types and emits the documented udf object and point mapping API', () => {
    const alias = analysisFunctionIdentifier('normalize');
    const result = compileAnalysisProgram({
      sourceBody: "return event.values().mapPoints((point) => point.withValue(udf.normalize(point.value, point, 0, {}, context)));",
      inputAliases: ['event'],
      functionBindings: [{
        functionKey: 'normalize',
        alias,
        functionKind: 'point-map',
        sourceBody: 'return (value ?? 0) * 2;',
      }],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('const udf = Object.freeze');
    expect(result.javascript).toContain('normalize');
    expect(result.javascript).toContain('.mapPoints');
  });

  it('types the ergonomic non-null map callback used by Explore', () => {
    const result = compileAnalysisProgram({
      sourceBody: 'return event.values().map((value, point, index, options) => value * 1000);',
      inputAliases: ['event'],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('value * 1000');
  });

  it('generates a concrete udf object with dot-access properties for every key', () => {
    const normalizeAlias = analysisFunctionIdentifier('normalize');
    const dashedAlias = analysisFunctionIdentifier('replace-null-with-zero');
    const declarations = generateFunctionBindingDeclarations([
      { functionKey: 'normalize', alias: normalizeAlias, functionKind: 'point-map' },
      { functionKey: 'replace-null-with-zero', alias: dashedAlias, functionKind: 'point-map' },
    ]);
    expect(analysisFunctionPropertyIdentifier('normalize')).toBe('normalize');
    expect(analysisFunctionPropertyIdentifier('replace-null-with-zero')).toBe('replace$null$with$zero');
    expect(declarations).toContain('const udf = Object.freeze({');
    expect(declarations).toContain(`normalize: ${normalizeAlias}`);
    expect(declarations).toContain(`replace$null$with$zero: ${dashedAlias}`);
    expect(declarations).toContain(`"replace-null-with-zero": ${dashedAlias}`);
    expect(declarations).not.toContain('declare const udf');
  });

  it('executes the same dot-access property exposed by the editor object', () => {
    const alias = analysisFunctionIdentifier('replace-null-with-zero');
    const result = compileAnalysisProgram({
      sourceBody: 'return event.values().map((value, point, index, options) => udf.replace$null$with$zero(value, point, index, options, context));',
      inputAliases: ['event'],
      functionBindings: [{
        functionKey: 'replace-null-with-zero',
        alias,
        functionKind: 'point-map',
        sourceBody: 'return value ?? 0;',
      }],
      semantic: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.javascript).toContain('replace$null$with$zero');
    expect(result.javascript).toContain('replace-null-with-zero');
  });

  it('offers every generated udf object property after typing udf.', () => {
    const bindings = [
      { functionKey: 'normalize', alias: analysisFunctionIdentifier('normalize'), functionKind: 'point-map' as const },
      { functionKey: 'replace-null-with-zero', alias: analysisFunctionIdentifier('replace-null-with-zero'), functionKind: 'point-map' as const },
    ];
    const generated = generateFunctionBindingDeclarations(bindings);
    const source = [
      'type NumericPoint = unknown;',
      'type AnalysisOptions = Record<string, unknown>;',
      'type AnalysisContext = unknown;',
      generated,
      'function transform() { return udf. }',
    ].join('\n');
    const fileName = '/udf-completion.ts';
    const files = new Map<string, string>([[fileName, source]]);
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      strict: true,
    };
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
    const position = source.lastIndexOf('udf.') + 'udf.'.length;
    const completions = service.getCompletionsAtPosition(fileName, position, {})?.entries.map((entry) => entry.name) ?? [];
    expect(completions).toEqual(expect.arrayContaining([
      'normalize',
      analysisFunctionPropertyIdentifier('replace-null-with-zero'),
    ]));
  });

});
