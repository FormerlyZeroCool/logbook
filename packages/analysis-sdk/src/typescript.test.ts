import { describe, expect, it } from 'vitest';
import { analysisFunctionIdentifier, buildProgramSourceDocument, compileAnalysisProgram, extractAnalysisBody } from './index.js';

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
});
