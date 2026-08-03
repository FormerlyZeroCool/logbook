import type { AnalysisFunctionKind } from '../contracts.js';
import { findAnalysisFunctionDeclaration, isCompleteAnalysisFunctionSource, rewriteAnalysisFunctionName } from './function-signatures.js';

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

export type AnalysisFunctionCollection =
  | 'mappers'
  | 'filters'
  | 'reducers'
  | 'window_transforms'
  | 'map_filters'
  | 'series_transforms';

/** Nested member of the generated `udf` object for a reusable function kind. */
export function analysisFunctionCollection(functionKind: AnalysisFunctionKind): AnalysisFunctionCollection {
  switch (functionKind) {
    case 'event-filter':
    case 'point-filter':
      return 'filters';
    case 'point-map':
      return 'mappers';
    case 'reducer':
      return 'reducers';
    case 'window-transform':
      return 'window_transforms';
    case 'map-filter':
      return 'map_filters';
    case 'series-transform':
      return 'series_transforms';
  }
}

/** Stable underscore-only property name. Legacy hyphens normalize to underscores. */
export function analysisFunctionPropertyIdentifier(functionKey: string): string {
  const normalized = functionKey.replace(/[^A-Za-z0-9_]/g, '_');
  if (!normalized) return '_function';
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
}

/** Public code-mode reference for a reusable function. */
export function analysisFunctionReference(functionKey: string, functionKind: AnalysisFunctionKind): string {
  return `udf.${analysisFunctionCollection(functionKind)}.${analysisFunctionPropertyIdentifier(functionKey)}`;
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

export function analysisFunctionSignature(kind: AnalysisFunctionKind): { parameters: string[]; returnType: string } {
  switch (kind) {
    case 'event-filter':
      return { parameters: ['event: EventRecord', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'boolean' };
    case 'point-map':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'NumericPoint' };
    case 'point-filter':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'boolean' };
    case 'map-filter':
      return { parameters: ['value: number | null', 'point: NumericPoint', 'index: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'NumericPoint | null' };
    case 'window-transform':
      return { parameters: ['window: NumericWindow', 'windowSize: number', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'NumericPoint' };
    case 'reducer':
      return { parameters: ['values: readonly (number | null)[]', 'points: readonly NumericPoint[]', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'number | string | null' };
    case 'series-transform':
      return { parameters: ['series: NumericSeries', 'options: AnalysisOptions', 'context: AnalysisContext'], returnType: 'AnalysisResult' };
  }
}

function functionPrefix(kind: AnalysisFunctionKind, alias: string): string {
  const signature = analysisFunctionSignature(kind);
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

function fullFunctionDocument(source: string): AnalysisSourceDocument {
  const text = source.trimEnd() + '\n';
  const lines = text.split('\n');
  return {
    text,
    bodyStartLine: 1,
    bodyEndLine: Math.max(1, lines.length - 1),
    prefix: '',
    suffix: '',
  };
}

function normalizeCompleteFunctionSource(source: string, kind: AnalysisFunctionKind, alias: string): string {
  let normalized = rewriteAnalysisFunctionName(source, alias);
  if (kind !== 'point-map') return normalized;
  const found = findAnalysisFunctionDeclaration(normalized);
  if (!found || found.declaration.parameters.length !== 4) return normalized;
  const first = found.declaration.parameters[0];
  if (!first || first.type?.getText(found.sourceFile).replace(/\s+/g, '') !== 'NumericPoint') return normalized;
  const start = first.getStart(found.sourceFile);
  const lineStart = normalized.lastIndexOf('\n', start - 1) + 1;
  const indentation = normalized.slice(lineStart, start);
  const separator = lineStart === 0 && normalized.slice(0, start).includes('(')
    ? 'value: number | null, '
    : `value: number | null,\n${indentation}`;
  return `${normalized.slice(0, start)}${separator}${normalized.slice(start)}`;
}

export function buildFunctionSourceDocument(sourceBody: string, kind: AnalysisFunctionKind, alias: string): AnalysisSourceDocument {
  if (isCompleteAnalysisFunctionSource(sourceBody)) {
    return fullFunctionDocument(normalizeCompleteFunctionSource(sourceBody, kind, alias));
  }
  return makeDocument(functionPrefix(kind, alias), sourceBody);
}

export function createAnalysisFunctionTemplate(kind: AnalysisFunctionKind, alias: string): string {
  const bodies: Record<AnalysisFunctionKind, string> = {
    'event-filter': 'return event.inRequestedRange;',
    'point-map': 'return point;',
    'point-filter': 'return value !== null;',
    'map-filter': 'return value === null ? null : point;',
    'window-transform': 'const valid = window.validValues();\nconst value = valid.length ? valid.reduce((total, item) => total + item, 0) / valid.length : null;\nreturn window.anchorPoint.withValue(value);',
    reducer: 'const valid = values.filter((value): value is number => value !== null);\nreturn valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : 0;',
    'series-transform': 'return series;',
  };
  return makeDocument(functionPrefix(kind, alias), bodies[kind]).text
    .replace(`  ${ANALYSIS_BODY_START}\n`, '')
    .replace(`\n  ${ANALYSIS_BODY_END}`, '');
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
  const signature = analysisFunctionSignature(kind);
  return `declare function ${alias}(${signature.parameters.join(', ')}): ${signature.returnType};`;
}
