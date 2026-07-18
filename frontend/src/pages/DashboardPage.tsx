import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, List } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { EventTypeSummary, UnitTypeDefinition } from '../types';
import { EventTypeCard } from '../components/EventTypeCard';
import { NewEventTypeDialog } from '../components/NewEventTypeDialog';
import { Button } from '../components/ui/button';
import { useCurrentTime } from '../use-current-time';
import { Card, CardContent } from '../components/ui/card';

interface DashboardData {
  eventTypes: EventTypeSummary[];
  unitTypes: UnitTypeDefinition[];
}

export function DashboardPage() {
  const recentLimit = 3;
  const [showArchived, setShowArchived] = useState(false);
  const queryClient = useQueryClient();
  const nowMs = useCurrentTime();
  const query = useQuery<DashboardData>({
    queryKey: ['dashboard', showArchived],
    queryFn: async (): Promise<DashboardData> => {
      const [eventTypes, unitTypes] = await Promise.all([
        api.listEventTypes(recentLimit, showArchived),
        api.listUnitTypes()
      ]);
      return { eventTypes, unitTypes };
    }
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['event-types'] });
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Managed time-series catalog</p>
          <h1>Recent activity</h1>
          <p>Events use managed types and backend-normalized measurement units.</p>
        </div>
        <div className="heading-actions">
          <Button asChild variant="secondary"><Link to="/events"><List className="size-4" />Browse all events</Link></Button>
          <label className="toggle-control">
            <Archive className="size-4" />
            <input type="checkbox" checked={showArchived} onChange={(event: ChangeEvent<HTMLInputElement>) => setShowArchived(event.target.checked)} />
            Show archived
          </label>
          <NewEventTypeDialog unitTypes={query.data?.unitTypes ?? []} onCreated={refresh} />
        </div>
      </div>

      {query.isPending && <p className="loading-state">Loading…</p>}
      {query.error && (
        <div className="error-panel">
          <strong>Could not load data</strong>
          <span>{query.error.message}</span>
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}
      {query.data?.eventTypes.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <h2 className="text-xl font-semibold">No event types yet</h2>
            <p className="mt-2 text-sm text-slate-400">Create one first. Event submissions cannot create a type implicitly.</p>
          </CardContent>
        </Card>
      )}
      <div className="type-grid">
        {query.data?.eventTypes.map((eventType: EventTypeSummary) => <EventTypeCard key={eventType.key} eventType={eventType} nowMs={nowMs} />)}
      </div>
    </>
  );
}
