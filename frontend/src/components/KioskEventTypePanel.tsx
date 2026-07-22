import { CheckCircle2, Clock3 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatCompactDateTime, formatTimeSinceFinish, formatTimeSinceStart } from '../format';
import type { EventTypeSummary, LogEvent } from '../types';
import { formatMeasuredValue } from '../units';

function formatEventValue(event: LogEvent): string {
  if (event.displayValue !== null && event.defaultUnit) {
    return formatMeasuredValue(event.displayValue, event.defaultUnit);
  }
  if (event.displayValue !== null) {
    return `${event.displayValue}${event.unit ? ` ${event.unit}` : ''}`;
  }
  return event.textValue ?? 'Event';
}

export function KioskEventTypePanel({ eventType, nowMs }: { eventType: EventTypeSummary; nowMs: number }) {
  const latestEvent = eventType.recentEvents?.[0] ?? null;
  const accent = eventType.color ?? '#60a5fa';

  return (
    <Link
      to={`/types/${encodeURIComponent(eventType.key)}`}
      className="kiosk-panel-link group"
      aria-label={`Open ${eventType.name}`}
    >
      <article className="kiosk-panel" style={{ '--accent': accent } as CSSProperties}>
        <span className="kiosk-panel-accent" aria-hidden="true" />
        <header className="kiosk-panel-header">
          <h2>{eventType.name}</h2>
          {latestEvent?.ongoing && <span className="kiosk-status">Ongoing</span>}
        </header>

        {!latestEvent ? (
          <div className="kiosk-empty">No events yet</div>
        ) : (
          <>
            <div className="kiosk-value" title={formatEventValue(latestEvent)}>
              {formatEventValue(latestEvent)}
            </div>

            {latestEvent.note && (
              <p className="kiosk-note" title={latestEvent.note}>
                {latestEvent.note}
              </p>
            )}

            <div className="kiosk-time-rows">
              <div className="kiosk-time-row">
                <span><Clock3 aria-hidden="true" />{latestEvent.eventKind === 'point' ? 'Recorded' : 'Started'}</span>
                <strong>{formatTimeSinceStart(latestEvent.startedAt, nowMs)}</strong>
                <small>{formatCompactDateTime(latestEvent.startedAt)}</small>
              </div>

              {latestEvent.eventKind === 'duration' && latestEvent.endedAt && (
                <div className="kiosk-time-row">
                  <span><CheckCircle2 aria-hidden="true" />Finished</span>
                  <strong>{formatTimeSinceFinish(latestEvent.endedAt, nowMs)}</strong>
                  <small>{formatCompactDateTime(latestEvent.endedAt)}</small>
                </div>
              )}
            </div>
          </>
        )}
      </article>
    </Link>
  );
}
