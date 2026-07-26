import { createHash } from 'node:crypto';

export function analysisSourceHash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
