import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { buildRequestHeaders } from '../src/request-headers.ts';

test('bodyless DELETE does not send a JSON content type', (context: TestContext): void => {
  void context;
  const headers: Headers = buildRequestHeaders({ method: 'DELETE' });
  assert.equal(headers.get('Accept'), 'application/json');
  assert.equal(headers.has('Content-Type'), false);
});

test('bodyless GET does not send a JSON content type', (context: TestContext): void => {
  void context;
  const headers: Headers = buildRequestHeaders({ method: 'GET' });
  assert.equal(headers.has('Content-Type'), false);
});

test('JSON request bodies receive the JSON content type', (context: TestContext): void => {
  void context;
  const headers: Headers = buildRequestHeaders({
    method: 'PATCH',
    body: JSON.stringify({ note: 'corrected' })
  });
  assert.equal(headers.get('Content-Type'), 'application/json');
});

test('caller supplied content type is preserved', (context: TestContext): void => {
  void context;
  const headers: Headers = buildRequestHeaders({
    method: 'POST',
    body: 'plain text',
    headers: { 'Content-Type': 'text/plain' }
  });
  assert.equal(headers.get('Content-Type'), 'text/plain');
});
