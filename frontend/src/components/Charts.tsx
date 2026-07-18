import { Activity, Clock3 } from 'lucide-react';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { MouseHandlerDataParam, TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DurationSeriesPoint, SeriesPoint, UnitDefinition, ValueSeriesPoint } from '../types';
import { formatCompactDateTime, formatDateTime, formatDuration } from '../format';
import { formatMeasuredValue } from '../units';
import {
  buildEventIntervalPoints,
  buildEventRatePoints,
  getDisplayDurationSeconds,
  type EventIntervalPoint,
  type EventRatePoint
} from '../duration';
import { useCurrentTime } from '../use-current-time';
import { buildTimedPoints, buildTimeAxisDomain, type TimedPoint } from '../time-axis';
import { buildEventTooltipRows, type EventTooltipRow } from '../chart-tooltip';
import {
  buildValueChartData,
  formatValueAggregation,
  isBucketedValueAggregation,
  valueAggregationOptions,
  type ValueAggregation,
  type ValueChartPoint
} from '../value-aggregation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';


function chartDot(fill: string) {
  return {
    r: 4,
    fill,
    fillOpacity: 1,
    opacity: 1,
    stroke: '#000000',
    strokeWidth: 1.5
  };
}

function activeChartDot(fill: string) {
  return {
    r: 6,
    fill,
    fillOpacity: 1,
    opacity: 1,
    stroke: '#000000',
    strokeWidth: 2
  };
}

function activeChartTimestamp(state: MouseHandlerDataParam): number | null {
  const timestamp = Number(state.activeLabel);
  return Number.isFinite(timestamp) ? timestamp : null;
}

interface DurationChartPoint extends DurationSeriesPoint {
  durationMinutes: number;
  displayDurationSeconds: number | null;
}

type TimedDurationChartPoint = TimedPoint<DurationChartPoint>;
type TimedEventRatePoint = TimedPoint<EventRatePoint>;

interface ChartFrameProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}

function ChartFrame({ title, subtitle, icon, controls, children }: ChartFrameProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between border-b border-slate-800/80">
        <div className="min-w-0 flex-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <div className="chart-header-actions">
          {controls}
          <div className="rounded-xl bg-slate-800 p-2 text-blue-300">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="h-80">{children}</div>
      </CardContent>
    </Card>
  );
}

function ChartTooltipPanel({
  title,
  rows,
  footer
}: {
  title: string;
  rows: readonly EventTooltipRow[];
  footer?: string;
}) {
  return (
    <div className="max-w-80 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-2xl backdrop-blur" role="tooltip">
      <p className="mb-2 font-semibold text-slate-100">{title}</p>
      <dl className="space-y-1.5">
        {rows.map((row: EventTooltipRow) => (
          <div key={row.label} className={row.multiline ? 'block' : 'flex items-start justify-between gap-5'}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
            <dd className={row.multiline
              ? 'mt-0.5 whitespace-pre-wrap break-words text-slate-200'
              : 'text-right font-medium text-slate-200'}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-500">{footer}</p>}
    </div>
  );
}

function tooltipPoint<T>(props: TooltipContentProps<ValueType, NameType>): T | null {
  if (!props.active || !props.payload?.length) return null;
  return (props.payload[0]?.payload as T | undefined) ?? null;
}

function formatValue(value: number, unit: UnitDefinition | null): string {
  if (unit) return formatMeasuredValue(value, unit);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function DurationEventTooltip({
  props,
  unit
}: {
  props: TooltipContentProps<ValueType, NameType>;
  unit: UnitDefinition | null;
}) {
  const point = tooltipPoint<TimedDurationChartPoint>(props);
  if (!point) return null;
  const rows = buildEventTooltipRows({
    value: point.value,
    textValue: point.textValue,
    note: point.note,
    durationSeconds: point.displayDurationSeconds,
    ongoing: point.ongoing
  }, unit);
  return <ChartTooltipPanel title={formatDateTime(point.startedAt)} rows={rows} />;
}

type CombinedValueIntervalChartPoint = {
  timestamp: number;
  at: string;
  displayValue: number | null;
  intervalMinutes: number | null;
  valuePoint: ValueChartPoint | null;
  intervalPoint: EventIntervalPoint | null;
};

function buildCombinedValueIntervalData(
  valuePoints: readonly ValueChartPoint[],
  intervalPoints: readonly EventIntervalPoint[]
): CombinedValueIntervalChartPoint[] {
  const combined = new Map<string, CombinedValueIntervalChartPoint>();

  for (const point of valuePoints) {
    const timestamp = Date.parse(point.at);
    if (!Number.isFinite(timestamp)) continue;
    const key = point.eventId ? `event:${point.eventId}` : `bucket:${point.at}`;
    combined.set(key, {
      timestamp,
      at: point.at,
      displayValue: point.displayValue,
      intervalMinutes: null,
      valuePoint: point,
      intervalPoint: null
    });
  }

  for (const point of intervalPoints) {
    const timestamp = Date.parse(point.startedAt);
    if (!Number.isFinite(timestamp)) continue;
    const key = `event:${point.eventId}`;
    const existing = combined.get(key);
    if (existing) {
      existing.intervalMinutes = point.intervalMinutes;
      existing.intervalPoint = point;
      continue;
    }
    combined.set(key, {
      timestamp,
      at: point.startedAt,
      displayValue: null,
      intervalMinutes: point.intervalMinutes,
      valuePoint: null,
      intervalPoint: point
    });
  }

  return [...combined.values()].sort((left: CombinedValueIntervalChartPoint, right: CombinedValueIntervalChartPoint) => left.timestamp - right.timestamp);
}

function CombinedValueIntervalTooltip({
  props,
  unit,
  nowMs,
  showValues,
  showIntervals
}: {
  props: TooltipContentProps<ValueType, NameType>;
  unit: UnitDefinition | null;
  nowMs: number;
  showValues: boolean;
  showIntervals: boolean;
}) {
  const point = tooltipPoint<CombinedValueIntervalChartPoint>(props);
  if (!point) return null;

  const valuePoint = point.valuePoint;
  const intervalPoint = point.intervalPoint;
  const rows: EventTooltipRow[] = [];

  if (showValues && valuePoint?.eventId === null) {
    rows.push(
      { label: 'Value', value: formatValue(valuePoint.displayValue, unit) },
      { label: 'Events', value: valuePoint.eventCount === 1 ? '1 event' : `${valuePoint.eventCount} events` }
    );
  }

  if (showIntervals && intervalPoint) {
    rows.push(
      { label: 'Until next start', value: formatDuration(intervalPoint.intervalSeconds) },
      { label: 'Next start', value: formatDateTime(intervalPoint.nextStartedAt) }
    );
  }

  const eventPoint = showIntervals && intervalPoint
    ? intervalPoint
    : showValues && valuePoint?.eventId
      ? valuePoint
      : null;
  if (eventPoint) {
    const startedAt = showIntervals && intervalPoint ? intervalPoint.startedAt : valuePoint!.at;
    const durationSeconds = getDisplayDurationSeconds({
      startedAt,
      endedAt: eventPoint.endedAt,
      durationSeconds: eventPoint.durationSeconds,
      ongoing: eventPoint.ongoing
    }, nowMs);
    rows.push(...buildEventTooltipRows({
      value: showValues ? valuePoint?.displayValue ?? null : null,
      textValue: eventPoint.textValue,
      note: eventPoint.note,
      durationSeconds,
      ongoing: eventPoint.ongoing
    }, unit));
  }

  const footer = showValues && showIntervals && valuePoint?.eventId === null
    ? 'Value totals use the selected aggregation; each time gap is attached to the event before it.'
    : null;
  return footer
    ? <ChartTooltipPanel title={formatDateTime(point.at)} rows={rows} footer={footer} />
    : <ChartTooltipPanel title={formatDateTime(point.at)} rows={rows} />;
}

export function ValueChart({
  points,
  aggregatePoints,
  intervalSourcePoints,
  unit,
  aggregation,
  onAggregationChange,
  onTimeRangeSelect
}: {
  points: ValueSeriesPoint[];
  aggregatePoints: SeriesPoint[];
  intervalSourcePoints: DurationSeriesPoint[];
  unit: UnitDefinition | null;
  aggregation: ValueAggregation;
  onAggregationChange: (aggregation: ValueAggregation) => void;
  onTimeRangeSelect?: (fromMs: number, toMs: number) => void;
}) {
  const nowMs = useCurrentTime();
  const [showValues, setShowValues] = useState(true);
  const [showIntervals, setShowIntervals] = useState(true);
  const [rangeStartMs, setRangeStartMs] = useState<number | null>(null);
  const [rangeEndMs, setRangeEndMs] = useState<number | null>(null);
  const valueData = buildValueChartData(points, aggregatePoints, aggregation);
  const intervalData = buildEventIntervalPoints(intervalSourcePoints);
  const data = buildCombinedValueIntervalData(valueData, intervalData);
  const hasValueData = data.some((point: CombinedValueIntervalChartPoint) => point.displayValue !== null);
  const hasIntervalData = data.some((point: CombinedValueIntervalChartPoint) => point.intervalMinutes !== null);
  const valuesVisible = showValues && hasValueData;
  const intervalsVisible = showIntervals && hasIntervalData;
  const visibleData = data.filter((point: CombinedValueIntervalChartPoint) => (
    (valuesVisible && point.displayValue !== null)
    || (intervalsVisible && point.intervalMinutes !== null)
  ));
  const timeDomain = buildTimeAxisDomain(visibleData);
  const unitLabel = unit?.symbol ?? null;
  const bucketed = isBucketedValueAggregation(aggregation);
  const aggregationLabel = formatValueAggregation(aggregation).toLowerCase();
  const subtitle = valuesVisible && intervalsVisible
    ? bucketed
      ? `Values are summed into ${aggregationLabel} buckets on the left axis; time until the next event start uses the right axis.`
      : unit
        ? `${unit.name} values use the left axis; time until the next event start uses the right axis.`
        : 'Recorded values use the left axis; time until the next event start uses the right axis.'
    : valuesVisible
      ? bucketed
        ? `Showing ${aggregationLabel} value totals on the left axis.`
        : unit
          ? `Showing ${unit.name} values on the left axis.`
          : 'Showing recorded values on the left axis.'
      : 'Showing time until the next event start on the right axis.';
  const valueName = bucketed ? 'Bucket total' : 'Value';

  function beginRangeSelection(state: MouseHandlerDataParam): void {
    if (!onTimeRangeSelect) return;
    const timestamp = activeChartTimestamp(state);
    if (timestamp === null) return;
    setRangeStartMs(timestamp);
    setRangeEndMs(timestamp);
  }

  function continueRangeSelection(state: MouseHandlerDataParam): void {
    if (rangeStartMs === null) return;
    const timestamp = activeChartTimestamp(state);
    if (timestamp !== null) setRangeEndMs(timestamp);
  }

  function finishRangeSelection(): void {
    const startMs = rangeStartMs;
    const endMs = rangeEndMs;
    setRangeStartMs(null);
    setRangeEndMs(null);
    if (!onTimeRangeSelect || startMs === null || endMs === null) return;
    const fromMs = Math.min(startMs, endMs);
    const toMs = Math.max(startMs, endMs);
    if (toMs - fromMs >= 1000) onTimeRangeSelect(fromMs, toMs);
  }

  function cancelRangeSelection(): void {
    setRangeStartMs(null);
    setRangeEndMs(null);
  }

  const aggregationControl = (
    <label className="inline-select chart-aggregation-select">
      <span>Aggregation</span>
      <select
        aria-label="Recorded values aggregation"
        value={aggregation}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onAggregationChange(event.target.value as ValueAggregation)}
      >
        {valueAggregationOptions.map((option: { value: ValueAggregation; label: string }) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );

  const seriesControls = (
    <div className="chart-series-toggles" role="group" aria-label="Visible chart curves">
      <button
        type="button"
        className="chart-series-toggle"
        aria-label="Toggle recorded values curve"
        aria-pressed={valuesVisible}
        disabled={!hasValueData || (valuesVisible && !intervalsVisible)}
        onClick={() => setShowValues((visible: boolean) => !visible)}
      >
        <span className="chart-series-swatch values" aria-hidden="true" />
        Values
      </button>
      <button
        type="button"
        className="chart-series-toggle"
        aria-label="Toggle time between starts curve"
        aria-pressed={intervalsVisible}
        disabled={!hasIntervalData || (intervalsVisible && !valuesVisible)}
        onClick={() => setShowIntervals((visible: boolean) => !visible)}
      >
        <span className="chart-series-swatch intervals" aria-hidden="true" />
        Time gaps
      </button>
    </div>
  );

  const chartControls = (
    <div className="chart-control-cluster">
      {aggregationControl}
      {seriesControls}
    </div>
  );

  return (
    <ChartFrame
      title={`Recorded values${unitLabel ? ` (${unitLabel})` : ''}`}
      subtitle={subtitle}
      icon={<Activity className="size-5" />}
      controls={chartControls}
    >
      {!visibleData.length ? <p className="empty-state">No data for the selected curve in this range.</p> : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleData}
            margin={{ top: 8, right: intervalsVisible ? 4 : 16, bottom: 4, left: 0 }}
            className="chart-drag-select"
            onMouseDown={beginRangeSelection}
            onMouseMove={continueRangeSelection}
            onMouseUp={finishRangeSelection}
            onMouseLeave={cancelRangeSelection}
          >
            <defs>
              <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-accent)" stopOpacity={0.38} />
                <stop offset="95%" stopColor="var(--chart-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              scale="time"
              dataKey="timestamp"
              domain={timeDomain}
              tickFormatter={formatCompactDateTime}
              minTickGap={34}
              axisLine={false}
              tickLine={false}
            />
            {valuesVisible && (
              <YAxis
                yAxisId="value"
                orientation="left"
                width={64}
                axisLine={false}
                tickLine={false}
              />
            )}
            {intervalsVisible && (
              <YAxis
                yAxisId="interval"
                orientation="right"
                width={72}
                domain={[0, 'auto']}
                tickFormatter={(value: unknown) => formatDuration(Number(value) * 60)}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-secondary)' }}
              />
            )}
            <Tooltip
              cursor={{ stroke: 'var(--chart-accent)', strokeDasharray: '4 4', opacity: 0.55 }}
              content={(props: TooltipContentProps<ValueType, NameType>) => (
                <CombinedValueIntervalTooltip
                  props={props}
                  unit={unit}
                  nowMs={nowMs}
                  showValues={valuesVisible}
                  showIntervals={intervalsVisible}
                />
              )}
            />
            {rangeStartMs !== null && rangeEndMs !== null && rangeStartMs !== rangeEndMs && (
              <ReferenceArea
                x1={Math.min(rangeStartMs, rangeEndMs)}
                x2={Math.max(rangeStartMs, rangeEndMs)}
                yAxisId={valuesVisible ? 'value' : 'interval'}
                fill="var(--chart-accent)"
                fillOpacity={0.14}
                stroke="var(--chart-accent)"
                strokeOpacity={0.7}
              />
            )}
            {valuesVisible && (
              <Area
                yAxisId="value"
                type={bucketed ? 'linear' : 'monotone'}
                dataKey="displayValue"
                name={valueName}
                stroke="var(--chart-accent)"
                strokeWidth={2.5}
                fill="url(#value-fill)"
                dot={chartDot('var(--chart-accent)')}
                activeDot={activeChartDot('var(--chart-accent)')}
                connectNulls
                {...(bucketed ? { baseValue: 0 } : {})}
              />
            )}
            {intervalsVisible && (
              <Line
                yAxisId="interval"
                type="monotone"
                dataKey="intervalMinutes"
                name="Time until next start"
                stroke="var(--chart-secondary)"
                strokeWidth={2.5}
                dot={chartDot('var(--chart-secondary)')}
                activeDot={activeChartDot('var(--chart-secondary)')}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

export function DurationChart({
  points,
  unit
}: {
  points: DurationSeriesPoint[];
  unit: UnitDefinition | null;
}) {
  const nowMs = useCurrentTime();
  const data = buildTimedPoints(
    points.map((point: DurationSeriesPoint): DurationChartPoint => {
      const displayDurationSeconds = getDisplayDurationSeconds(point, nowMs);
      return {
        ...point,
        displayDurationSeconds,
        durationMinutes: (displayDurationSeconds ?? 0) / 60
      };
    }),
    (point: DurationChartPoint) => point.startedAt
  );
  const timeDomain = buildTimeAxisDomain(data);

  return (
    <ChartFrame
      title="Event durations"
      subtitle="Events are positioned by start time; point logs remain at zero and ongoing events show elapsed duration."
      icon={<Clock3 className="size-5" />}
    >
      {!data.length ? <p className="empty-state">No events in this range.</p> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="duration-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-secondary)" stopOpacity={0.34} />
                <stop offset="95%" stopColor="var(--chart-secondary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              scale="time"
              dataKey="timestamp"
              domain={timeDomain}
              tickFormatter={formatCompactDateTime}
              minTickGap={34}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={58}
              domain={[0, 'auto']}
              tickFormatter={(value: unknown) => formatDuration(Number(value) * 60)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: 'var(--chart-secondary)', strokeDasharray: '4 4', opacity: 0.55 }}
              content={(props: TooltipContentProps<ValueType, NameType>) => <DurationEventTooltip props={props} unit={unit} />}
            />
            <Area
              type="linear"
              dataKey="durationMinutes"
              name="Duration"
              stroke="var(--chart-secondary)"
              strokeWidth={2.5}
              fill="url(#duration-fill)"
              dot={chartDot('var(--chart-secondary)')}
              activeDot={activeChartDot('var(--chart-secondary)')}
              baseValue={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

function EventRateTooltip({
  props,
  unit
}: {
  props: TooltipContentProps<ValueType, NameType>;
  unit: UnitDefinition | null;
}) {
  const point = tooltipPoint<TimedEventRatePoint>(props);
  if (!point) return null;
  const rate = `${formatValue(point.valuePerMinute, unit)}/min`;
  const rows: EventTooltipRow[] = [
    { label: 'Rate', value: rate },
    ...buildEventTooltipRows({
      value: point.value,
      textValue: point.textValue,
      note: point.note,
      durationSeconds: point.displayDurationSeconds,
      ongoing: point.ongoing
    }, unit)
  ];
  return <ChartTooltipPanel title={formatDateTime(point.startedAt)} rows={rows} />;
}

export function EventRateChart({
  points,
  unit
}: {
  points: DurationSeriesPoint[];
  unit: UnitDefinition | null;
}) {
  const nowMs = useCurrentTime();
  const data = buildTimedPoints(
    buildEventRatePoints(points, nowMs),
    (point: EventRatePoint) => point.startedAt
  );
  const timeDomain = buildTimeAxisDomain(data);
  const unitLabel = unit?.symbol ? `${unit.symbol}/min` : 'per minute';

  return (
    <ChartFrame
      title={`Value ÷ duration (${unitLabel})`}
      subtitle="Recorded numeric value divided by event duration; point events and zero-length durations are omitted."
      icon={<Activity className="size-5" />}
    >
      {!data.length ? <p className="empty-state">No numeric duration events in this range.</p> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="rate-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-accent)" stopOpacity={0.34} />
                <stop offset="95%" stopColor="var(--chart-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              scale="time"
              dataKey="timestamp"
              domain={timeDomain}
              tickFormatter={formatCompactDateTime}
              minTickGap={34}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={64}
              tickFormatter={(value: unknown) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value))}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: 'var(--chart-accent)', strokeDasharray: '4 4', opacity: 0.55 }}
              content={(props: TooltipContentProps<ValueType, NameType>) => <EventRateTooltip props={props} unit={unit} />}
            />
            <Area
              type="monotone"
              dataKey="valuePerMinute"
              name="Value per minute"
              stroke="var(--chart-accent)"
              strokeWidth={2.5}
              fill="url(#rate-fill)"
              dot={chartDot('var(--chart-accent)')}
              activeDot={activeChartDot('var(--chart-accent)')}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

