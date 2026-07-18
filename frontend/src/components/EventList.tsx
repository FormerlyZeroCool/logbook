import { Check, Pencil, Trash2 } from 'lucide-react';
import type { LogEvent } from '../types';
import { formatDateTime, formatDuration } from '../format';
import { formatMeasuredValue } from '../units';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { getDisplayDurationSeconds } from '../duration';
import { useCurrentTime } from '../use-current-time';

export function EventList({
  events,
  compact = false,
  showEventType = false,
  onEnd,
  onEdit,
  onDelete
}: {
  events: LogEvent[];
  compact?: boolean;
  showEventType?: boolean;
  onEnd?: (event: LogEvent) => void;
  onEdit?: (event: LogEvent) => void;
  onDelete?: (event: LogEvent) => void;
}) {
  const nowMs = useCurrentTime();
  if (!events.length) return <p className="empty-state">No events yet.</p>;

  return (
    <div className={compact ? 'event-list compact' : 'event-list'}>
      {events.map((event: LogEvent) => {
        const measured = event.displayValue !== null && event.defaultUnit
          ? formatMeasuredValue(event.displayValue, event.defaultUnit)
          : event.displayValue !== null
            ? `${event.displayValue}${event.unit ? ` ${event.unit}` : ''}`
            : null;
        const displayDurationSeconds = getDisplayDurationSeconds(event, nowMs);
        return (
          <div className="event-row" key={event.id}>
            <div className="event-main">
              <div className="event-value">
                {showEventType && <Badge variant="muted">{event.eventTypeName}</Badge>}
                {measured ?? event.textValue ?? 'Event'}
                {event.ongoing && <Badge variant="success">Ongoing</Badge>}
              </div>
              <div className="event-meta">
                {formatDateTime(event.startedAt)} · {event.eventKind === 'point' ? 'point · 0s' : formatDuration(displayDurationSeconds)}
                {event.inputValue !== null && event.inputUnit && event.defaultUnit && event.inputUnit.key !== event.defaultUnit.key
                  ? ` · entered as ${formatMeasuredValue(event.inputValue, event.inputUnit)}`
                  : ''}
                {event.note ? ` · ${event.note}` : ''}
              </div>
            </div>
            {!compact && (onEnd || onEdit || onDelete) && (
              <div className="row-actions">
                {event.ongoing && onEnd && (
                  <Button size="sm" variant="secondary" onClick={() => onEnd(event)}><Check className="size-3.5" />Finish</Button>
                )}
                {onEdit && (
                  <Button size="sm" variant="secondary" onClick={() => onEdit(event)}><Pencil className="size-3.5" />Edit</Button>
                )}
                {onDelete && (
                  <Button size="sm" variant="destructive" onClick={() => onDelete(event)}><Trash2 className="size-3.5" />Delete</Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
