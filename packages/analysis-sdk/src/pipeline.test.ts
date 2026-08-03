import { describe, expect, it } from 'vitest';
import {
  generatePipelineExpression,
  generateProgramBody,
  parsePipelineExpression,
  parseProgramBody,
} from './index.js';

describe('pipeline parser', () => {
  it('canonicalizes aliases and infers context', () => {
    const result = parsePipelineExpression(
      'feeding.value().windowed_map(udf.window_transforms.smooth, 4).reduce(udf.reducers.mean_result)',
      { smooth: 'window-transform', mean_result: 'reducer' },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.definition?.queryContext.rowsBefore).toBe(3);
    expect(generatePipelineExpression(result.definition!)).toContain('.values()');
    expect(generatePipelineExpression(result.definition!)).toContain('.transformWindow(udf.window_transforms.smooth, 4)');
    expect(generatePipelineExpression(result.definition!)).toContain('.reduce(udf.reducers.mean_result)');
  });

  it('parses a complete transform body with nested UDF factories', () => {
    const source = `// Source remains canonical until the visual pipeline is edited.\nreturn event\n  .values()\n  .map(udf.mappers.clamp(0, 100))\n  .filter(udf.filters.positive_only)\n  .reduce(udf.reducers.mean);`;
    const result = parseProgramBody(source, {
      clamp: 'point-map',
      positive_only: 'point-filter',
      mean: 'reducer',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.definition?.steps[1]).toMatchObject({
      operation: 'map',
      functionBinding: 'clamp',
      arguments: [0, 100],
    });
    expect(generateProgramBody(result.definition!)).toContain('.map(udf.mappers.clamp(0, 100))');
    expect(generateProgramBody(result.definition!)).toContain('.filter(udf.filters.positive_only)');
    expect(generateProgramBody(result.definition!)).toContain('.reduce(udf.reducers.mean)');
  });

  it('refuses valid code that cannot be represented as one visual chain', () => {
    const source = `const values = event.values();\nreturn values;`;
    const result = parseProgramBody(source);
    expect(result.definition).toBeNull();
    expect(result.diagnostics).toMatchObject([{ code: 'pipeline_unrepresentable' }]);
  });

  it('rejects calls after reduce', () => {
    const result = parsePipelineExpression(
      'feeding.values().reduce(udf.reducers.mean_result).map(udf.mappers.normalize)',
      { mean_result: 'reducer', normalize: 'point-map' },
    );
    expect(result.diagnostics.some((item) => item.code === 'call_after_terminal')).toBe(true);
  });
});
