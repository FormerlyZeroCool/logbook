import type { AnalysisLimits, SerializedAnalysisResult, SerializedNumericPoint } from '../contracts.js';
import { NumericSeries } from '../sdk/NumericSeries.js';
import { ScalarValue } from '../sdk/ScalarValue.js';
import { SeriesSet } from '../sdk/SeriesSet.js';

function checkPoint(point: SerializedNumericPoint): void {
  if (!Number.isFinite(point.timeMs) || Number.isNaN(Date.parse(point.time))) throw new Error('Analysis output contains an invalid timestamp');
  if (point.value !== null && !Number.isFinite(point.value)) throw new Error('Analysis output contains a non-finite value');
}

export function serializeAnalysisResult(result: unknown, limits?: Pick<AnalysisLimits, 'maxOutputPoints' | 'maxOutputSeries' | 'maxSerializedBytes'>): SerializedAnalysisResult {
  const serialized = result instanceof ScalarValue ? result.toJSON() : result instanceof NumericSeries ? result.toJSON() : result instanceof SeriesSet ? result.toJSON() : result as SerializedAnalysisResult;
  if (!serialized || !['scalar', 'series', 'series-set'].includes((serialized as { kind?: string }).kind ?? '')) throw new Error('Program must return ScalarValue, NumericSeries, or SeriesSet');
  const series = serialized.kind === 'series' ? [serialized] : serialized.kind === 'series-set' ? serialized.series : [];
  if (limits && series.length > limits.maxOutputSeries) throw new Error('Analysis output exceeds the series limit');
  const pointCount = series.reduce((total, item) => total + item.points.length, 0);
  if (limits && pointCount > limits.maxOutputPoints) throw new Error('Analysis output exceeds the point limit');
  series.forEach((item) => item.points.forEach(checkPoint));
  const encoded = JSON.stringify(serialized);
  if (limits && new TextEncoder().encode(encoded).byteLength > limits.maxSerializedBytes) throw new Error('Analysis output exceeds the serialized-size limit');
  return serialized;
}
