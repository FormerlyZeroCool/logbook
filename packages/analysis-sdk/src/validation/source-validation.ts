import { parse } from '@babel/parser';
import type { SourceDiagnostic } from '../contracts.js';

const forbiddenPatterns: Array<[RegExp, string, string]> = [
  [/\bimport\s*\(/, 'dynamic_import', 'Dynamic import is unavailable in the analysis sandbox'],
  [/\b(?:import|export)\b/, 'module_syntax', 'Import and export syntax is unavailable in program bodies'],
  [/\bawait\b|\byield\b/, 'async_syntax', 'await and yield are unavailable in synchronous analysis programs'],
  [/\bwith\s*\(/, 'with_statement', 'with statements are forbidden'],
  [/\beval\s*\(/, 'direct_eval', 'eval is forbidden'],
  [/\bFunction\s*\(/, 'function_constructor', 'The Function constructor is forbidden'],
  [/\bWebAssembly\b/, 'webassembly', 'WebAssembly is not exposed inside user programs']
];

export function validateProgramSource(sourceBody: string, inputAliases: readonly string[]): SourceDiagnostic[] {
  const wrapper = `function transform(${[...inputAliases, 'context'].join(', ')}) {\n${sourceBody}\n}`;
  const diagnostics: SourceDiagnostic[] = [];
  try {
    parse(wrapper, { sourceType: 'script', strictMode: true, plugins: ['typescript'] });
  } catch (error) {
    const value = error as { message?: string; loc?: { line: number; column: number } };
    diagnostics.push({ severity: 'error', code: 'syntax_error', message: value.message ?? 'Invalid TypeScript', line: Math.max(1, (value.loc?.line ?? 2) - 1), column: (value.loc?.column ?? 0) + 1 });
    return diagnostics;
  }
  for (const [pattern, code, message] of forbiddenPatterns) {
    const match = pattern.exec(sourceBody);
    if (match) {
      const prefix = sourceBody.slice(0, match.index);
      diagnostics.push({ severity: 'error', code, message, line: prefix.split('\n').length, column: match.index - prefix.lastIndexOf('\n') });
    }
  }
  if (/\b(?:while|for)\s*\(\s*(?:true|;;)/.test(sourceBody)) diagnostics.push({ severity: 'warning', code: 'possible_unbounded_loop', message: 'This source contains an obviously unbounded loop; the runtime timeout will interrupt it', line: 1, column: 1 });
  return diagnostics;
}
