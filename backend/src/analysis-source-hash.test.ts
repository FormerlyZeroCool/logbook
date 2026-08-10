import { describe, expect, it } from 'vitest';
import { analysisSourceHash } from './analysis/source-hash.js';
describe('analysis source hash', () => { it('is stable and content sensitive', () => { expect(analysisSourceHash('return 1')).toBe(analysisSourceHash('return 1')); expect(analysisSourceHash('return 1')).not.toBe(analysisSourceHash('return 2')); }); });
