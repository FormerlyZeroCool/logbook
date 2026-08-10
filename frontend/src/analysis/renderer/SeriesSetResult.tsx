import type { SerializedSeriesSet } from '@logbook/analysis-sdk';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatAxisTime(value: unknown): string {
  return new Date(Number(value)).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  });
}

export function SeriesSetResult({ result }: { result: SerializedSeriesSet }) {
  const byTime = new Map<number, Record<string, number | null>>();
  for (const series of result.series) {
    for (const point of series.points) {
      byTime.set(point.timeMs, {
        ...(byTime.get(point.timeMs) ?? { x: point.timeMs }),
        [series.key ?? series.label]: point.value,
      });
    }
  }
  const data = [...byTime.values()].sort(
    (a, b) => Number(a.x) - Number(b.x),
  );

  return (
    <article className="analysis-series">
      <header>
        <h3>{result.title ?? 'Series'}</h3>
        <span>{result.series.length} series</span>
      </header>
      <div className="analysis-chart">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={formatAxisTime}
            />
            <YAxis yAxisId="left" domain={['auto', 'auto']} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={['auto', 'auto']}
            />
            <Tooltip
              labelFormatter={(value: unknown) =>
                new Date(Number(value)).toLocaleString()
              }
            />
            <Legend />
            {result.series.map((series, index) => (
              <Line
                key={series.key ?? series.label}
                yAxisId={index === 1 ? 'right' : 'left'}
                type="monotone"
                dataKey={series.key ?? series.label}
                name={series.label}
                connectNulls={false}
                isAnimationActive={false}
                dot={{ r: 3, strokeWidth: 1 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
