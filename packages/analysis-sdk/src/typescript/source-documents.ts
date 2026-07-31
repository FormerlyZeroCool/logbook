import type { AnalysisFunctionKind } from '../contracts.js';

export const ANALYSIS_BODY_START = '/*__LOGBOOK_ANALYSIS_BODY_START__*/';
export const ANALYSIS_BODY_END = '/*__LOGBOOK_ANALYSIS_BODY_END__*/';

export type AnalysisSourceDocument = {
  text: string;
  bodyStartLine: number;
  bodyEndLine: number;
  prefix: string;
  suffix: string;
};

export function analysisFunctionIdentifier(functionKey: string): string {
  let hash = 0x811c9dc5;
  for (const character of functionKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  const stem = functionKey.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^([^A-Za-z_$])/, '_$1');
  return `fn_${stem}_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Stable, collision-free property name for dot access on the public `udf` object. */
export function analysisFunctionPropertyIdentifier(functionKey: string): string {
  const encoded = functionKey
    .replaceAll('-', '$')
    .replace(/[^A-Za-z0-9_$]/g, (character) => `$${character.codePointAt(0)!.toString(16)}$`);
  if (!encoded) return '$udf';
  return /^[A-Za-z_$]/.test(encoded) ? encoded : `$${encoded}`;
}

function indentBody(body: string): string {
  return body.split('\n').map((line) => line.length ? `  ${line}` : '').join('\n');
}

function programPrefix(inputAliases: readonly string[]): string {
  const parameters = [
    ...inputAliases.map((alias) => `  ${alias}: EventSeries,`),
    '  context: AnalysisContext,'
  ].join('\n');
  return `function transform(\n${parameters}\n): AnalysisResult {\n  ${ANALYSIS_BODY_START}\n`;
}

function functionSignature(kind: AnalysisFunctionKind): { parameters: string[]; returnType: string } {
  switch (kind) {
    case 'event-filter':
      return { parameters: ['event: EventRecord', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'boolean' };
    case 'point-map':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'number | null' };
    case 'point-filter':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'boolean' };
    case 'map-filter':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'MapFilterResult' };
    case 'window-transform':
      return { parameters: ['window: NumericWindow', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'number | null' };
    case 'reducer':
      return { parameters: ['values: readonly (number | null)[]', 'points: readonly NumericPoint[]', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'number | string | null | ScalarValue' };
    case 'series-transform':
      return { parameters: ['series: NumericSeries', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'AnalysisResult' };
  }
}

function functionPrefix(kind: AnalysisFunctionKind, alias: string): string {
  const signature = functionSignature(kind);
  return `function ${alias}(\n${signature.parameters.map((parameter) => `  ${parameter},`).join('\n')}\n): ${signature.returnType} {\n  ${ANALYSIS_BODY_START}\n`;
}

function makeDocument(prefix: string, body: string): AnalysisSourceDocument {
  const suffix = `\n  ${ANALYSIS_BODY_END}\n}\n`;
  const bodyStartLine = prefix.split('\n').length;
  const bodyLineCount = Math.max(1, body.split('\n').length);
  return {
    text: `${prefix}${indentBody(body)}${suffix}`,
    bodyStartLine,
    bodyEndLine: bodyStartLine + bodyLineCount - 1,
    prefix,
    suffix,
  };
}

export function buildProgramSourceDocument(sourceBody: string, inputAliases: readonly string[]): AnalysisSourceDocument {
  return makeDocument(programPrefix(inputAliases), sourceBody);
}

export function buildFunctionSourceDocument(sourceBody: string, kind: AnalysisFunctionKind, alias: string): AnalysisSourceDocument {
  return makeDocument(functionPrefix(kind, alias), sourceBody);
}

export function extractAnalysisBody(sourceText: string): string | null {
  const start = sourceText.indexOf(ANALYSIS_BODY_START);
  const end = sourceText.indexOf(ANALYSIS_BODY_END);
  if (start < 0 || end < 0 || end <= start) return null;
  const raw = sourceText.slice(start + ANALYSIS_BODY_START.length, end);
  const withoutBoundaryNewlines = raw.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
  const lines = withoutBoundaryNewlines.split('\n');
  const nonBlank = lines.filter((line) => line.trim().length > 0);
  const indentation = nonBlank.length ? Math.min(...nonBlank.map((line) => line.match(/^\s*/)?.[0].length ?? 0)) : 0;
  return lines.map((line) => line.slice(Math.min(indentation, line.length))).join('\n');
}

export function functionBindingDeclaration(kind: AnalysisFunctionKind, alias: string): string {
  const signature = functionSignature(kind);
  return `declare function ${alias}(${signature.parameters.join(', ')}): ${signature.returnType};`;
}
