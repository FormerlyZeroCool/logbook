import type { SerializedSeries } from '@logbook/analysis-sdk';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SerializedSeries['points'][number] }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="analysis-tooltip">
      <strong>{new Date(point.time).toLocaleString()}</strong>
      <span>Value: {point.value ?? '—'}</span>
      {point.textValue && <span>Text: {point.textValue}</span>}
      {point.note && <span>Note: {point.note}</span>}
      {point.startedAt && <span>Started: {new Date(point.startedAt).toLocaleString()}</span>}
      {point.endedAt && <span>Ended: {new Date(point.endedAt).toLocaleString()}</span>}
    </div>
  );
}

function formatAxisTime(value: unknown): string {
  return new Date(Number(value)).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  });
}

export function SeriesResult({ result }: { result: SerializedSeries }) {
  const data = result.points.map((point) => ({ ...point, x: point.timeMs }));
  const serializedValues = JSON.stringify(result.points.map((point) => point.value));
  return (
    <article className="analysis-series">
      <header>
        <h3>{result.label}</h3>
        <span>{result.points.length} points{result.unit?.symbol ? ` · ${result.unit.symbol}` : ''}</span>
      </header>
      <div className="analysis-chart" data-analysis-values={serializedValues}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={formatAxisTime} />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip content={<TooltipContent />} />
            <Line type="monotone" dataKey="value" name={result.label} connectNulls={false} isAnimationActive={false} dot={{ r: 3, strokeWidth: 1 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
