import { parentPort } from 'node:worker_threads';
import { getQuickJS } from 'quickjs-emscripten';
import {
  QUICKJS_BOOTSTRAP_SOURCE,
  mandatoryAnalysisFixtures,
  validateSerializedOutput,
  type AnalysisLimits,
  type AnalysisQueryResponseV1,
  type SerializedAnalysisResult,
  type SerializedSeries
} from '@logbook/analysis-sdk';

type Request = { compiledJavaScript: string; inputAliases: string[]; limits: AnalysisLimits };

type RuntimeResult = { output: SerializedAnalysisResult; durationMs: number };

const SERIALIZER_SOURCE = `
function __serializePoint(point) {
  return { time: point.time, timeMs: point.timeMs, value: point.value, eventId: point.eventId ?? null,
    note: point.note ?? null, textValue: point.textValue ?? null, startedAt: point.startedAt ?? null,
    endedAt: point.endedAt ?? null, inRequestedRange: Boolean(point.inRequestedRange) };
}
function __serializeSeries(series) {
  return { kind: 'series', key: series.key ?? null, label: series.label,
    unit: series.unit ?? null, points: series.points.filter((point) => point.inRequestedRange).map(__serializePoint) };
}
function __serializeResult(result) {
  if (typeof result === 'number' || typeof result === 'string' || result === null) return { kind: 'scalar', value: result, label: null, unit: null, description: null };
  if (result instanceof ScalarValue) return { kind: 'scalar', value: result.value, label: result.label, unit: result.unit, description: result.description };
  if (result instanceof NumericSeries) return __serializeSeries(result);
  if (result instanceof SeriesSet) return { kind: 'series-set', title: result.title, series: result.series.map(__serializeSeries) };
  throw new Error('Program must return a number, string, null, ScalarValue, NumericSeries, or SeriesSet');
}`;

function executionSource(request: Request, fixture: AnalysisQueryResponseV1): string {
  const aliases = request.inputAliases.join(', ');
  const fixtureInput = fixture.inputs.event ?? Object.values(fixture.inputs)[0];
  if (!fixtureInput) throw new Error('Validation fixture has no input series');
  const aliasedFixture: AnalysisQueryResponseV1 = {
    ...fixture,
    inputs: Object.fromEntries(request.inputAliases.map((alias: string) => [alias, { ...fixtureInput, key: alias, label: alias }]))
  };
  return `${QUICKJS_BOOTSTRAP_SOURCE}
${SERIALIZER_SOURCE}
let __consoleEntries=0; const console=Object.freeze({log:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');},warn:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');},error:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');}});
${request.compiledJavaScript}
const __query = ${JSON.stringify(aliasedFixture)};
const __context = new AnalysisContext(__query.context);
${request.inputAliases.map((alias: string) => `const ${alias} = new EventSeries(__query.inputs[${JSON.stringify(alias)}], __context.nowMs);`).join('\n')}
JSON.stringify(__serializeResult(transform(${aliases}${aliases ? ', ' : ''}__context)));`;
}

async function execute(request: Request, fixture: AnalysisQueryResponseV1): Promise<RuntimeResult> {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(request.limits.memoryBytes);
  runtime.setMaxStackSize(request.limits.stackBytes);
  const deadline = Date.now() + request.limits.timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  const started = performance.now();
  try {
    const result = context.evalCode(executionSource(request, fixture), 'analysis-program.js');
    if (result.error) {
      const dumped = context.dump(result.error);
      result.error.dispose();
      throw new Error(typeof dumped === 'object' && dumped && 'message' in dumped ? String(dumped.message) : JSON.stringify(dumped));
    }
    const encoded = context.dump(result.value);
    result.value.dispose();
    if (typeof encoded !== 'string') throw new Error('Runtime did not return serialized JSON');
    if (Buffer.byteLength(encoded, 'utf8') > request.limits.maxSerializedBytes) throw new Error('Analysis output exceeds serialized-size limit');
    const output = JSON.parse(encoded) as SerializedAnalysisResult;
    const schema = validateSerializedOutput(output);
    if (!schema.valid) throw new Error(schema.errors.join('; '));
    const series: SerializedSeries[] = output.kind === 'series' ? [output] : output.kind === 'series-set' ? output.series : [];
    const points = series.reduce((total: number, item: SerializedSeries) => total + item.points.length, 0);
    if (series.length > request.limits.maxOutputSeries) throw new Error('Analysis output exceeds series limit');
    if (points > request.limits.maxOutputPoints) throw new Error('Analysis output exceeds point limit');
    return { output, durationMs: performance.now() - started };
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

parentPort?.on('message', async (request: Request) => {
  const fixtures = [];
  let failed = false;
  for (const fixture of mandatoryAnalysisFixtures) {
    try {
      const first = await execute(request, fixture.response);
      const second = await execute(request, fixture.response);
      const deterministic = JSON.stringify(first.output) === JSON.stringify(second.output);
      if (!deterministic) throw new Error('Repeated execution produced different output');
      const outputPointCount = first.output.kind === 'series' ? first.output.points.length : first.output.kind === 'series-set' ? first.output.series.reduce((sum: number, series: SerializedSeries) => sum + series.points.length, 0) : 0;
      fixtures.push({ key: fixture.key, status: 'passed', durationMs: Math.round(first.durationMs), inputPointCount: fixture.response.inputs.event?.events.length ?? 0, outputPointCount, diagnostics: [] });
    } catch (error) {
      failed = true;
      fixtures.push({ key: fixture.key, status: 'failed', durationMs: 0, inputPointCount: fixture.response.inputs.event?.events.length ?? 0, outputPointCount: 0, diagnostics: [{ severity: 'error', code: 'fixture_failed', message: error instanceof Error ? error.message : String(error), line: 1, column: 1 }] });
    }
  }
  parentPort?.postMessage({ failed, fixtures });
});
