import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { EventTypeSummary, UnitTypeDefinition } from '../types';
import { NewEventTypeDialog } from '../components/NewEventTypeDialog';
import { EditEventTypeDialog } from '../components/EditEventTypeDialog';

interface EventTypesData {
  eventTypes: EventTypeSummary[];
  unitTypes: UnitTypeDefinition[];
}

export function EventTypesPage() {
  const queryClient = useQueryClient();
  const query = useQuery<EventTypesData>({
    queryKey: ['event-types'],
    queryFn: async (): Promise<EventTypesData> => {
      const [eventTypes, unitTypes] = await Promise.all([api.listEventTypes(0, true), api.listUnitTypes()]);
      return { eventTypes, unitTypes };
    }
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['event-types'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">Time-series catalog</p>
        <h1>Event types</h1>
        <p>Create, update, archive, and inspect the types accepted by event logging.</p>
      </div>
      <NewEventTypeDialog unitTypes={query.data?.unitTypes ?? []} onCreated={refresh} />
    </div>
    {query.isPending && <p className="loading-state">Loading…</p>}
    {query.error && <div className="error-panel"><strong>Could not load event types</strong><span>{query.error.message}</span><button onClick={() => void query.refetch()}>Retry</button></div>}
    {query.data && <section className="table-card">
      <div className="responsive-table">
        <table>
          <thead><tr><th>Name</th><th>Event mix</th><th>Measurement</th><th>Events</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {query.data.eventTypes.map((eventType: EventTypeSummary) => <tr key={eventType.key}>
              <td><Link className="table-link" to={`/types/${encodeURIComponent(eventType.key)}`}><strong>{eventType.name}</strong><br /><code>{eventType.key}</code></Link></td>
              <td>{eventType.pointEvents} point · {eventType.durationEvents} duration</td>
              <td>{eventType.unitType ? `${eventType.unitType.name} · ${eventType.defaultUnit?.symbol}` : 'Unitless'}</td>
              <td>{eventType.totalEvents}</td>
              <td>{eventType.isActive ? <span className="status-pill ongoing">active</span> : <span className="status-pill archived-pill">archived</span>}</td>
              <td><EditEventTypeDialog eventType={eventType} unitTypes={query.data.unitTypes} onChanged={refresh} deleteRedirect="/event-types" /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </>;
}
