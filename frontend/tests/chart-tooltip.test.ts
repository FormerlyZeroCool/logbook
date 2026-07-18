import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tooltipUrl = new URL('../src/chart-tooltip.ts', import.meta.url);

test('event tooltip rows include value, populated text, note, and duration', async (): Promise<void> => {
  const tooltip = await readFile(tooltipUrl, 'utf8');

  assert.match(tooltip, /label: 'Value'/);
  assert.match(tooltip, /label: 'Text'/);
  assert.match(tooltip, /label: 'Note'/);
  assert.match(tooltip, /label: 'Duration'/);
  assert.match(tooltip, /presentText\(event\.textValue\)/);
  assert.match(tooltip, /presentText\(event\.note\)/);
  assert.match(tooltip, /event\.ongoing \? ' \(ongoing\)' : ''/);
});
