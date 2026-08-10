import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
const base = { DATABASE_URL: 'postgres://example', API_KEY: '1234567890123456', NODE_ENV: 'test' };
describe('analysis configuration', () => {
  it('uses bounded defaults', () => { const config = loadConfig(base); expect(config.analysis.executionTimeoutMs).toBe(5000); expect(config.analysis.workerPoolSize).toBe(2); });
  it('rejects unlimited or excessive timeouts', () => { expect(() => loadConfig({ ...base, ANALYSIS_EXECUTION_TIMEOUT_MS: '0' })).toThrow(); expect(() => loadConfig({ ...base, ANALYSIS_EXECUTION_TIMEOUT_MS: '30001' })).toThrow(); });
});
