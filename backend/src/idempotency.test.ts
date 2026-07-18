import { describe, expect, it } from 'vitest';
import { createRequestFingerprint, stableStringify } from './idempotency.js';

describe('idempotency fingerprints', () => {
  it('is stable across JSON object key order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('changes when method, path, or request body changes', () => {
    const base = createRequestFingerprint('POST', '/events/log', { eventTypeKey: 'water', value: 1 });
    expect(createRequestFingerprint('PATCH', '/events/log', { eventTypeKey: 'water', value: 1 })).not.toBe(base);
    expect(createRequestFingerprint('POST', '/events/start', { eventTypeKey: 'water', value: 1 })).not.toBe(base);
    expect(createRequestFingerprint('POST', '/events/log', { eventTypeKey: 'water', value: 2 })).not.toBe(base);
  });
});
