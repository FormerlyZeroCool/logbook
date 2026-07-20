import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, History } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { EventTypeSummary, LogEvent, SeriesResponse, UnitDefinition, UnitTypeDefinition } from '../types';
import { LogEventDialog } from '../components/LogEventDialog';
import { EditEventTypeDialog } from '../components/EditEventTypeDialog';
import { EditLatestEventDialog } from '../components/EditLatestEventDialog';
import { EditEventDialog } from '../components/EditEventDialog';
import { EventList } from '../components/EventList';
import { DurationChart, EventRateChart, ValueChart } from '../components/Charts';
import { findUnitType } from '../units';
import { formatDateTime, formatTimeSinceCompact } from '../format';
import { buildFinishEventRequest } from '../event-actions';
import { useCurrentTime } from '../use-current-time';
import { selectLatestEvent } from '../latest-event';
import { getBrowserTimeZone } from '../time-zone';
import { getSeriesBucket, type ValueAggregation } from '../value-aggregation';
import {
  buildCustomTimeWindow,
  DEFAULT_CHART_RANGE_PRESET,
  buildPresetTimeWindow,
  chartRangePresets,
  formatDateTimeLocal,
  parseDateTimeLocal,
  type ChartRangePresetKey,
  type ChartTimeWindow
} from '../chart-range';

type ChartRangeSelection = ChartTimeWindow & {
  mode: ChartRangePresetKey | 'custom';
  fromInput: string;
  toInput: string;
};

function buildPresetSelection(key: ChartRangePresetKey, nowMs: number = Date.now()): ChartRangeSelection {
  const window = buildPresetTimeWindow(key, nowMs);
  return {
    ...window,
    mode: key,
    fromInput: formatDateTimeLocal(window.fromMs),
    toInput: formatDateTimeLocal(window.toMs)
  };
}

function buildCustomSelection(fromMs: number, toMs: number): ChartRangeSelection | null {
  const window = buildCustomTimeWindow(fromMs, toMs);
  if (!window) return null;
  return {
    ...window,
    mode: 'custom',
    fromInput: formatDateTimeLocal(window.fromMs),
    toInput: formatDateTimeLocal(window.toMs)
  };
}

export function EventTypePage() {
  const { key = '' } = useParams();
  const decodedKey = decodeURIComponent(key);
  const [rangeSelection, setRangeSelection] = useState<ChartRangeSelection>(() => buildPresetSelection(DEFAULT_CHART_RANGE_PRESET));
  const [displayUnitKey, setDisplayUnitKey] = useState('');
  const [valueAggregation, setValueAggregation] = useState<ValueAggregation>('events');
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<LogEvent | null>(null);
  const queryClient = useQueryClient();
  const nowMs = useCurrentTime();
  const browserTimeZone = getBrowserTimeZone();

  const eventTypeQuery = useQuery<EventTypeSummary>({
    queryKey: ['event-type', decodedKey],
    queryFn: (): Promise<EventTypeSummary> => api.getEventType(decodedKey)
  });
  const unitTypesQuery = useQuery<UnitTypeDefinition[]>({
    queryKey: ['unit-types'],
    queryFn: api.listUnitTypes
  });
  const eventsQuery = useQuery<LogEvent[]>({
    queryKey: ['events', decodedKey],
    queryFn: (): Promise<LogEvent[]> => api.listEvents({ eventTypeKey: decodedKey, limit: 100 }),
    enabled: Boolean(decodedKey)
  });
  const seriesQuery = useQuery<SeriesResponse>({
    queryKey: [
      'series',
      decodedKey,
      rangeSelection.fromMs,
      rangeSelection.toMs,
      displayUnitKey,
      valueAggregation,
      browserTimeZone
    ],
    queryFn: (): Promise<SeriesResponse> => api.getSeries(
      decodedKey,
      new Date(rangeSelection.fromMs).toISOString(),
      new Date(rangeSelection.toMs).toISOString(),
      getSeriesBucket(valueAggregation, rangeSelection.bucket),
      browserTimeZone,
      displayUnitKey || undefined
    ),
    enabled: Boolean(eventTypeQuery.data)
  });
  const latestEventQuery = useQuery<LogEvent>({
    queryKey: ['latest-event', decodedKey],
    queryFn: (): Promise<LogEvent> => api.getLatestEvent(decodedKey),
    enabled: (eventTypeQuery.data?.totalEvents ?? 0) > 0,
    retry: false
  });

  useEffect((): void => {
    if (!displayUnitKey && eventTypeQuery.data?.defaultUnit?.key) {
      setDisplayUnitKey(eventTypeQuery.data.defaultUnit.key);
    }
  }, [displayUnitKey, eventTypeQuery.data?.defaultUnit?.key]);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['event-type', decodedKey] });
    void queryClient.invalidateQueries({ queryKey: ['events', decodedKey] });
    void queryClient.invalidateQueries({ queryKey: ['series', decodedKey] });
    void queryClient.invalidateQueries({ queryKey: ['latest-event', decodedKey] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['event-types'] });
  };

  function selectPreset(key: ChartRangePresetKey): void {
    setRangeSelection(buildPresetSelection(key));
  }

  function updateCustomInput(field: 'fromInput' | 'toInput', value: string): void {
    setRangeSelection((current: ChartRangeSelection): ChartRangeSelection => {
      const fromInput = field === 'fromInput' ? value : current.fromInput;
      const toInput = field === 'toInput' ? value : current.toInput;
      const fromMs = parseDateTimeLocal(fromInput);
      const toMs = parseDateTimeLocal(toInput);
      const window = fromMs === null || toMs === null ? null : buildCustomTimeWindow(fromMs, toMs);
      return window
        ? { ...window, mode: 'custom', fromInput, toInput }
        : { ...current, mode: 'custom', fromInput, toInput };
    });
  }

  function selectChartRange(fromMs: number, toMs: number): void {
    const selection = buildCustomSelection(Math.min(fromMs, toMs), Math.max(fromMs, toMs));
    if (selection) setRangeSelection(selection);
  }

  async function endEvent(event: LogEvent): Promise<void> {
    setActionError(null);
    try {
      await api.endEvent(buildFinishEventRequest(event.id));
      refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Could not finish event');
    }
  }

  async function deleteEvent(event: LogEvent): Promise<void> {
    if (!window.confirm(`Delete the event from ${new Date(event.startedAt).toLocaleString()}?`)) return;
    setActionError(null);
    try {
      await api.deleteEvent(event.id);
      refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Could not delete event');
    }
  }

  const draftFromMs = parseDateTimeLocal(rangeSelection.fromInput);
  const draftToMs = parseDateTimeLocal(rangeSelection.toInput);
  const customRangeIsValid = draftFromMs !== null && draftToMs !== null && draftFromMs < draftToMs;
  const loading = eventTypeQuery.isPending || unitTypesQuery.isPending || eventsQuery.isPending || seriesQuery.isPending;
  const error = eventTypeQuery.error ?? unitTypesQuery.error ?? eventsQuery.error ?? seriesQuery.error;
  const eventType = eventTypeQuery.data;
  const series = seriesQuery.data;
  const events = eventsQuery.data ?? [];
  const latestEvent = selectLatestEvent(latestEventQuery.data, eventType?.recentEvents, events);

  if (loading) return <p className="loading-state">Loading…</p>;
  if (error || !eventType || !series) return <div className="error-panel"><strong>Could not load event type</strong><span>{error?.message ?? 'Not found'}</span></div>;

  const unitType = findUnitType(unitTypesQuery.data ?? [], eventType.unitType?.key);
  const displayUnit: UnitDefinition | null = unitType?.units.find((unit: UnitDefinition) => unit.key === displayUnitKey)
    ?? eventType.defaultUnit
    ?? null;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="title-with-status">
            <p className="eyebrow">{eventType.key}</p>
            {!eventType.isActive && <span className="status-pill archived-pill">archived</span>}
          </div>
          <h1>{eventType.name}</h1>
          <p>{eventType.description ?? `${eventType.totalEvents} recorded events`}</p>
        </div>
        <div className="heading-actions">
          <EditEventTypeDialog eventType={eventType} unitTypes={unitTypesQuery.data ?? []} onChanged={refresh} />
          {latestEvent && (
            <EditLatestEventDialog eventType={eventType} event={latestEvent} unitType={unitType} onChanged={refresh} />
          )}
          {eventType.isActive
            ? <LogEventDialog eventType={eventType} unitType={unitType} onCreated={refresh} />
            : <span className="archive-note">New events disabled</span>}
        </div>
      </div>

      <div className="summary-strip">
        <div><span>Total events</span><strong>{eventType.totalEvents}</strong></div>
        <div><span>Ongoing</span><strong>{eventType.ongoingEvents}</strong></div>
        <div><span>Point logs</span><strong>{eventType.pointEvents}</strong></div>
        <div><span>Durations</span><strong>{eventType.durationEvents}</strong></div>
        <div>
          <span>Time since last event</span>
          <strong className="text-sm! leading-6">
            Start: {formatTimeSinceCompact(latestEvent?.startedAt ?? null, '—', nowMs)}<br />
            End: {latestEvent?.endedAt
              ? formatTimeSinceCompact(latestEvent.endedAt, '—', nowMs)
              : latestEvent?.ongoing ? 'Ongoing' : '—'}
          </strong>
        </div>
        <div>
          <span className="flex items-center gap-1"><History className="size-3" />Latest</span>
          <strong className="text-sm!">{latestEvent ? formatDateTime(latestEvent.startedAt) : '—'}</strong>
        </div>
      </div>

      <div className="chart-range-toolbar">
        <div className="range-switcher" role="group" aria-label="Chart range presets">
          <Clock className="mx-2 size-4 self-center text-slate-500" />
          {chartRangePresets.map((preset: typeof chartRangePresets[number]) => (
            <button
              key={preset.key}
              type="button"
              className={rangeSelection.mode === preset.key ? 'active' : ''}
              onClick={() => selectPreset(preset.key)}
            >
              {preset.label}
            </button>
          ))}
          {unitType && (
            <label className="inline-select chart-unit-select">Display unit
              <select value={displayUnitKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDisplayUnitKey(event.target.value)}>
                {unitType.units.map((unit: UnitDefinition) => <option key={unit.key} value={unit.key}>{unit.symbol} — {unit.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="date-range-editor" aria-label="Custom chart date range">
          <label>
            <span>Start</span>
            <input
              aria-label="Chart start date and time"
              type="datetime-local"
              step="1"
              value={rangeSelection.fromInput}
              max={rangeSelection.toInput || undefined}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateCustomInput('fromInput', event.target.value)}
            />
          </label>
          <label>
            <span>End</span>
            <input
              aria-label="Chart end date and time"
              type="datetime-local"
              step="1"
              value={rangeSelection.toInput}
              min={rangeSelection.fromInput || undefined}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateCustomInput('toInput', event.target.value)}
            />
          </label>
          <p className="chart-range-hint">Choose dates directly, or drag across the Recorded values chart to zoom.</p>
          {!customRangeIsValid && <p className="chart-range-error" role="alert">Start must be before end.</p>}
        </div>
      </div>

      <div className="chart-stack" style={{ '--chart-accent': eventType.color ?? '#60a5fa' } as CSSProperties}>
        <ValueChart
          points={series.valuePoints}
          aggregatePoints={series.points}
          intervalSourcePoints={series.durationPoints}
          unit={displayUnit}
          aggregation={valueAggregation}
          onAggregationChange={setValueAggregation}
          onTimeRangeSelect={selectChartRange}
        />
        <div className="insight-chart-grid">
          <DurationChart points={series.durationPoints} unit={displayUnit} />
          <EventRateChart points={series.durationPoints} unit={displayUnit} />
        </div>
      </div>

      {actionError && (
        <div className="error-panel" role="alert">
          <strong>Event action failed</strong>
          <span>{actionError}</span>
        </div>
      )}

      <section className="table-card">
        <div className="section-heading"><h2>Recent events</h2><span>Last {events.length}</span></div>
        <EventList
          events={events}
          onEnd={(event: LogEvent) => void endEvent(event)}
          onEdit={(event: LogEvent) => setEditingEvent(event)}
          onDelete={(event: LogEvent) => void deleteEvent(event)}
        />
      </section>

      <EditEventDialog
        eventType={eventType}
        event={editingEvent}
        unitType={unitType}
        open={editingEvent !== null}
        onOpenChange={(open: boolean) => { if (!open) setEditingEvent(null); }}
        onChanged={() => { setEditingEvent(null); refresh(); }}
      />
    </>
  );
}
