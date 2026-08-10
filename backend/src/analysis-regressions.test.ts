import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');

describe('analysis integration regressions', () => {
  it('omits undefined optional route fields under exactOptionalPropertyTypes', async () => {
    const routes = await readFile(path.join(sourceRoot, 'routes/analysis.ts'), 'utf8');
    expect(routes).toContain('body.description === undefined');
    expect(routes).toContain('body.expectedUpdatedAt === undefined');
    expect(routes).toContain('body.autoRun === undefined');
  });
});
