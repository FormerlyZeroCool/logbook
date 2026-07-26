import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('module interop regressions', () => {
  it('constructs Ajv through its named class export under NodeNext', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'src/validation/output-schema.ts'),
      'utf8'
    );
    expect(source).toContain("import { Ajv } from 'ajv';");
    expect(source).not.toContain("import Ajv from 'ajv';");
    expect(source).not.toContain("default as Ajv");
  });
});
