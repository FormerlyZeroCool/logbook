import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSessionFunctionId,
  type SessionFunctionCrypto,
} from '../src/analysis/editor/session-function-id.ts';

test('session UDF IDs fall back to getRandomValues without randomUUID', () => {
  const source: SessionFunctionCrypto = {
    getRandomValues(values: Uint8Array): Uint8Array {
      values.forEach((_: number, index: number) => {
        values[index] = index;
      });
      return values;
    },
  };

  const id = createSessionFunctionId(source);

  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('session UDF IDs prefer randomUUID when it is available', () => {
  const expected = '11111111-2222-4333-8444-555555555555';
  const source: SessionFunctionCrypto = {
    randomUUID: (): string => expected,
  };

  assert.equal(createSessionFunctionId(source), expected);
});
