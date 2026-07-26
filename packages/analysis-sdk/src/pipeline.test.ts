import { describe, expect, it } from 'vitest';
import { analysisFunctionIdentifier, generatePipelineExpression, parsePipelineExpression } from './index.js';

describe('pipeline parser', () => {
  it('canonicalizes aliases and infers context', () => {
    const result = parsePipelineExpression('feeding.value().windowed_map(smooth, 4).reduce(meanResult)', { smooth: 'window-transform', meanResult: 'reducer' });
    expect(result.diagnostics).toEqual([]);
    expect(result.definition?.queryContext.rowsBefore).toBe(3);
    expect(generatePipelineExpression(result.definition!)).toContain('.values()');
    expect(generatePipelineExpression(result.definition!)).toContain(`.transformWindow(${analysisFunctionIdentifier('smooth')}, 4)`);
  });
  it('rejects calls after reduce', () => {
    const result = parsePipelineExpression('feeding.values().reduce(meanResult).map(normalize)', { meanResult: 'reducer', normalize: 'point-map' });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'call_after_terminal')).toBe(true);
  });
});
