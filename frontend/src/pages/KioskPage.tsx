import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { KioskEventTypePanel } from '../components/KioskEventTypePanel';
import { buildKioskPages, KIOSK_ROTATION_INTERVAL_MS } from '../kiosk';
import type { EventTypeSummary } from '../types';
import { useCurrentTime } from '../use-current-time';

export function KioskPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const nowMs = useCurrentTime();
  const query = useQuery<EventTypeSummary[]>({
    queryKey: ['kiosk'],
    queryFn: () => api.listEventTypes(1, false)
  });

  const pages = useMemo(() => buildKioskPages(query.data ?? []), [query.data]);
  const pageCount = pages.length;

  useEffect(() => {
    setPageIndex((current: number) => pageCount === 0 ? 0 : Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect((): (() => void) | undefined => {
    if (pageCount <= 1) return undefined;

    const timerId = window.setInterval(() => {
      setPageIndex((current: number) => (current + 1) % pageCount);
    }, KIOSK_ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [pageCount]);

  if (query.isPending) return <div className="kiosk-state">Loading…</div>;
  if (query.error) {
    return (
      <div className="kiosk-state kiosk-state-error">
        <strong>Could not load kiosk activity</strong>
        <span>{query.error.message}</span>
        <button onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }
  if (pageCount === 0) return <div className="kiosk-state">No active event types yet.</div>;

  return (
    <section className="kiosk-page" aria-label="Logbook kiosk activity">
      <div
        className="kiosk-track"
        style={{ transform: `translate3d(-${pageIndex * 100}%, 0, 0)` }}
      >
        {pages.map((page: EventTypeSummary[], index: number) => (
          <div
            className="kiosk-slide"
            key={page.map((eventType: EventTypeSummary) => eventType.id).join(':')}
            aria-hidden={index !== pageIndex}
            inert={index !== pageIndex}
          >
            <div className={`kiosk-grid kiosk-grid-count-${page.length}`}>
              {page.map((eventType: EventTypeSummary) => (
                <KioskEventTypePanel key={eventType.key} eventType={eventType} nowMs={nowMs} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        Kiosk page {pageIndex + 1} of {pageCount}
      </span>
    </section>
  );
}
