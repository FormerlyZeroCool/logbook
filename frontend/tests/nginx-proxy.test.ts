import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';

test('same-origin API proxy removes the browser Origin header', async (context: TestContext): Promise<void> => {
  void context;
  const template = await readFile(new URL('../nginx/default.conf.template', import.meta.url), 'utf8');

  assert.match(template, /location \/api\/ \{[\s\S]*proxy_set_header Origin "";/);
  assert.match(template, /proxy_set_header Authorization "Bearer \${API_KEY}";/);
});
