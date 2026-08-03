/// <reference lib="webworker" />
import { getQuickJS } from 'quickjs-emscripten';
import { QUICKJS_BOOTSTRAP_SOURCE, compileAnalysisProgram, validateSerializedOutput, type SerializedAnalysisResult } from '@logbook/analysis-sdk';
import type { AnalysisRunRequest, AnalysisWorkerRequest, AnalysisWorkerResponse } from './protocol';

const cancelled = new Set<string>();
const serializer = `
function __point(point){return {time:point.time,timeMs:point.timeMs,value:point.value,eventId:point.eventId??null,note:point.note??null,textValue:point.textValue??null,startedAt:point.startedAt??null,endedAt:point.endedAt??null,inRequestedRange:Boolean(point.inRequestedRange)}}
function __series(series){return {kind:'series',key:series.key??null,label:series.label,unit:series.unit??null,points:series.points.filter((point)=>point.inRequestedRange).map(__point)}}
function __result(result){if(typeof result==='number'||typeof result==='string'||result===null)return {kind:'scalar',value:result,label:null,unit:null,description:null};if(result instanceof ScalarValue)return {kind:'scalar',value:result.value,label:result.label,unit:result.unit,description:result.description};if(result instanceof NumericSeries)return __series(result);if(result instanceof SeriesSet)return {kind:'series-set',title:result.title,series:result.series.map(__series)};throw new Error('Program must return a number, string, null, ScalarValue, NumericSeries, or SeriesSet')}`;

function buildSource(request: AnalysisRunRequest): { source: string | null; error: string | null } {
  const aliases = request.inputAliases.join(', ');
  const compilation = compileAnalysisProgram({
    sourceBody: request.sourceBody,
    inputAliases: request.inputAliases,
    functionBindings: request.functionBindings,
    semantic: false
  });
  if (!compilation.javascript) {
    return { source: null, error: compilation.diagnostics.map((diagnostic) => `${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`).join('; ') || 'TypeScript compilation failed' };
  }
  return { source: `${QUICKJS_BOOTSTRAP_SOURCE}
${serializer}
let __consoleEntries=0; const console=Object.freeze({log:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');},warn:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');},error:(..._args)=>{if(++__consoleEntries>${request.limits.maxLogs})throw new Error('Console entry limit exceeded');}});
${compilation.javascript}
const __query=${JSON.stringify(request.queryResponse)};const __context=new AnalysisContext(__query.context);
${request.inputAliases.map((alias) => `const ${alias}=new EventSeries(__query.inputs[${JSON.stringify(alias)}],__context.nowMs);`).join('\n')}
JSON.stringify(__result(transform(${aliases}${aliases ? ',' : ''}__context)));`, error: null };
}

async function run(request: AnalysisRunRequest): Promise<AnalysisWorkerResponse> {
  const compiled = buildSource(request);
  if (!compiled.source) return { type: 'error', requestId: request.requestId, code: 'compile', message: compiled.error ?? 'TypeScript compilation failed' };
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(request.limits.memoryBytes);
  runtime.setMaxStackSize(request.limits.stackBytes);
  const deadline = Date.now() + request.limits.timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline || cancelled.has(request.requestId));
  const context = runtime.newContext();
  const started = performance.now();
  try {
    const evaluation = context.evalCode(compiled.source, 'explore-program.js');
    if (evaluation.error) {
      const dumped = context.dump(evaluation.error) as { name?: string; message?: string; stack?: string };
      evaluation.error.dispose();
      const timedOut = Date.now() > deadline;
      return { type: 'error', requestId: request.requestId, code: cancelled.has(request.requestId) ? 'cancelled' : timedOut ? 'timeout' : 'runtime', message: dumped.message ?? JSON.stringify(dumped), ...(dumped.stack ? { stack: dumped.stack } : {}) };
    }
    const encoded = context.dump(evaluation.value);
    evaluation.value.dispose();
    if (typeof encoded !== 'string') return { type: 'error', requestId: request.requestId, code: 'invalid-output', message: 'Guest runtime did not return JSON' };
    if (new TextEncoder().encode(encoded).byteLength > request.limits.maxSerializedBytes) return { type: 'error', requestId: request.requestId, code: 'invalid-output', message: 'Serialized result is too large' };
    const result = JSON.parse(encoded) as SerializedAnalysisResult;
    const validation = validateSerializedOutput(result);
    if (!validation.valid) return { type: 'error', requestId: request.requestId, code: 'invalid-output', message: validation.errors.join('; ') };
    const series = result.kind === 'series' ? [result] : result.kind === 'series-set' ? result.series : [];
    const outputPointCount = series.reduce((sum, item) => sum + item.points.length, 0);
    if (series.length > request.limits.maxOutputSeries || outputPointCount > request.limits.maxOutputPoints) return { type: 'error', requestId: request.requestId, code: 'invalid-output', message: 'Result exceeds configured output limits' };
    return { type: 'result', requestId: request.requestId, result, durationMs: Math.round(performance.now() - started), inputPointCount: Object.values(request.queryResponse.inputs).reduce((sum, input) => sum + input.events.length, 0), outputPointCount };
  } finally {
    cancelled.delete(request.requestId); context.dispose(); runtime.dispose();
  }
}

self.onmessage = (event: MessageEvent<AnalysisWorkerRequest>) => {
  if (event.data.type === 'cancel') { cancelled.add(event.data.requestId); return; }
  void run(event.data).then((response) => self.postMessage(response));
};
