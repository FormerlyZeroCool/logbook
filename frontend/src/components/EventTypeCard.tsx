import { ArrowUpRight, CheckCircle2, CircleDot, Clock3, Timer } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { EventTypeSummary } from '../types';
import { formatTimeSinceFinish, formatTimeSinceStart } from '../format';
import { EventList } from './EventList';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';

export function EventTypeCard({ eventType, nowMs }: { eventType: EventTypeSummary; nowMs: number }) {
  const accent = eventType.color ?? '#60a5fa';
  return (
    <Link to={`/types/${encodeURIComponent(eventType.key)}`} className="group block">
      <Card
        className={`relative h-full overflow-hidden transition duration-200 group-hover:-translate-y-0.5 group-hover:border-slate-700 group-hover:shadow-2xl${eventType.isActive ? '' : ' opacity-70 saturate-50'}`}
        style={{ '--accent': accent } as CSSProperties}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
        <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">{eventType.name}</h2>
              {eventType.pointEvents > 0 && <Badge><CircleDot className="mr-1 size-3" />{eventType.pointEvents}</Badge>}
              {eventType.durationEvents > 0 && <Badge><Timer className="mr-1 size-3" />{eventType.durationEvents}</Badge>}
              {eventType.unitType && <Badge variant="muted">{eventType.defaultUnit?.symbol ?? eventType.unitType.name}</Badge>}
              {!eventType.isActive && <Badge variant="muted">Archived</Badge>}
            </div>
            <p className="mt-1 truncate text-sm text-slate-400">{eventType.description ?? eventType.key}</p>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            <div className="text-right">
              <strong className="block text-2xl font-bold text-white">{eventType.totalEvents}</strong>
              <span className="text-[.68rem] font-bold uppercase tracking-wider text-slate-500">events</span>
            </div>
            <ArrowUpRight className="mt-1 size-4 text-slate-600 transition group-hover:text-blue-300" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="event-timing-summary">
            <div>
              <span><Clock3 className="size-3.5" />Last event start</span>
              <strong>{formatTimeSinceStart(eventType.latestStartedAt, nowMs)}</strong>
            </div>
            <div>
              <span><CheckCircle2 className="size-3.5" />Last event finish</span>
              <strong>{formatTimeSinceFinish(eventType.latestEndedAt, nowMs)}</strong>
            </div>
          </div>
          {eventType.ongoingEvents > 0 && <div className="ongoing-banner">{eventType.ongoingEvents} currently active</div>}
          <EventList events={eventType.recentEvents ?? []} compact />
        </CardContent>
      </Card>
    </Link>
  );
}
