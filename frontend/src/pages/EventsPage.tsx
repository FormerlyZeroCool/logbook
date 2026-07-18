import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { EditEventDialog } from '../components/EditEventDialog';
import { EventList } from '../components/EventList';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/form-controls';
import { buildFinishEventRequest } from '../event-actions';
import type { EventTypeSummary, LogEvent, PaginatedEvents, UnitTypeDefinition } from '../types';
import { findUnitType } from '../units';

interface EventsCatalogData {
  eventTypes: EventTypeSummary[];
  unitTypes: UnitTypeDefinition[];
}

function pageWindow(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_value: unknown, index: number) => start + index);
}

export function EventsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [noteInput, setNoteInput] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [eventTypeKey, setEventTypeKey] = useState('');
  const [editingEvent, setEditingEvent] = useState<LogEvent | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const eventsQuery = useQuery<PaginatedEvents>({
    queryKey: ['all-events', page, pageSize, noteSearch, eventTypeKey],
    queryFn: (): Promise<PaginatedEvents> => api.listEventsPage({
      page,
      pageSize,
      ...(noteSearch ? { note: noteSearch } : {}),
      ...(eventTypeKey ? { eventTypeKey } : {})
    })
  });
  const catalogQuery = useQuery<EventsCatalogData>({
    queryKey: ['events-catalog'],
    queryFn: async (): Promise<EventsCatalogData> => {
      const [eventTypes, unitTypes] = await Promise.all([
        api.listEventTypes(0, true),
        api.listUnitTypes()
      ]);
      return { eventTypes, unitTypes };
    }
  });

  useEffect((): void => {
    const serverPage = eventsQuery.data?.pagination.page;
    if (serverPage && serverPage !== page) setPage(serverPage);
  }, [eventsQuery.data?.pagination.page, page]);

  const eventTypesByKey = useMemo((): Map<string, EventTypeSummary> => new Map(
    (catalogQuery.data?.eventTypes ?? []).map((eventType: EventTypeSummary) => [eventType.key, eventType])
  ), [catalogQuery.data?.eventTypes]);

  const selectedEventType = eventTypeKey ? eventTypesByKey.get(eventTypeKey) ?? null : null;
  const editingEventType = editingEvent ? eventTypesByKey.get(editingEvent.eventType) ?? null : null;
  const editingUnitType = editingEventType
    ? findUnitType(catalogQuery.data?.unitTypes ?? [], editingEventType.unitType?.key)
    : null;

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['all-events'] });
    void queryClient.invalidateQueries({ queryKey: ['events'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['event-types'] });
    void queryClient.invalidateQueries({ queryKey: ['event-type'] });
    void queryClient.invalidateQueries({ queryKey: ['latest-event'] });
    void queryClient.invalidateQueries({ queryKey: ['series'] });
  };

  function submitSearch(formEvent: FormEvent<HTMLFormElement>): void {
    formEvent.preventDefault();
    setPage(1);
    setNoteSearch(noteInput.trim());
  }

  function clearFilters(): void {
    setNoteInput('');
    setNoteSearch('');
    setEventTypeKey('');
    setPage(1);
  }

  async function finishEvent(event: LogEvent): Promise<void> {
    setActionError(null);
    try {
      await api.endEvent(buildFinishEventRequest(event.id));
      refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Could not finish event');
    }
  }

  async function deleteEvent(event: LogEvent): Promise<void> {
    if (!window.confirm(`Delete the ${event.eventTypeName} event from ${new Date(event.startedAt).toLocaleString()}?`)) return;
    setActionError(null);
    try {
      await api.deleteEvent(event.id);
      if (editingEvent?.id === event.id) setEditingEvent(null);
      refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Could not delete event');
    }
  }

  const loading = eventsQuery.isPending || catalogQuery.isPending;
  const error = eventsQuery.error ?? catalogQuery.error;
  const events = eventsQuery.data?.events ?? [];
  const pagination = eventsQuery.data?.pagination;
  const firstResult = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastResult = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Complete event history</p>
          <h1>All events</h1>
          <p>Filter by event type, search notes, correct event details, or remove records.</p>
        </div>
      </div>

      <section className="table-card event-browser-card">
        <div className="event-browser-toolbar">
          <form className="event-filter-form" onSubmit={submitSearch}>
            <label className="event-filter-field event-type-filter">
              <span>Event type</span>
              <Select
                aria-label="Filter events by event type"
                value={eventTypeKey}
                disabled={catalogQuery.isPending}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setEventTypeKey(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All event types</option>
                {(catalogQuery.data?.eventTypes ?? []).map((eventType: EventTypeSummary) => (
                  <option key={eventType.key} value={eventType.key}>
                    {eventType.name}{eventType.isActive ? '' : ' (archived)'}
                  </option>
                ))}
              </Select>
            </label>

            <label className="event-filter-field event-note-filter">
              <span>Note contains</span>
              <div className="event-search-input">
                <Search className="size-4" aria-hidden="true" />
                <Input
                  aria-label="Search event notes"
                  value={noteInput}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setNoteInput(event.target.value)}
                  placeholder="Search notes…"
                  maxLength={500}
                />
              </div>
            </label>

            <div className="event-filter-actions">
              <Button type="submit">Search notes</Button>
              {(noteInput || noteSearch || eventTypeKey) && (
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  <X className="size-4" />Clear filters
                </Button>
              )}
            </div>
          </form>

          <label className="inline-select event-page-size">
            Events per page
            <Select
              value={pageSize}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
          </label>
        </div>

        {(selectedEventType || noteSearch) && (
          <p className="active-search">
            Showing {selectedEventType ? <strong>{selectedEventType.name}</strong> : 'all event types'}
            {noteSearch ? <> whose note contains “{noteSearch}”</> : null}.
          </p>
        )}
        {loading && <p className="loading-state">Loading…</p>}
        {error && (
          <div className="error-panel">
            <strong>Could not load events</strong>
            <span>{error.message}</span>
            <button onClick={() => {
              void eventsQuery.refetch();
              void catalogQuery.refetch();
            }}>Retry</button>
          </div>
        )}
        {actionError && (
          <div className="error-panel" role="alert">
            <strong>Event action failed</strong>
            <span>{actionError}</span>
          </div>
        )}
        {!loading && !error && (
          <EventList
            events={events}
            showEventType
            onEnd={(event: LogEvent) => void finishEvent(event)}
            onEdit={(event: LogEvent) => setEditingEvent(event)}
            onDelete={(event: LogEvent) => void deleteEvent(event)}
          />
        )}

        {pagination && (
          <div className="pagination-bar">
            <span>{pagination.total === 0 ? 'No matching events' : `Showing ${firstResult}–${lastResult} of ${pagination.total}`}</span>
            <div className="pagination-controls" aria-label="Event pages">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!pagination.hasPrevious}
                onClick={() => setPage((current: number) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" />Previous
              </Button>
              {pageWindow(pagination.page, pagination.totalPages).map((pageNumber: number) => (
                <Button
                  key={pageNumber}
                  type="button"
                  size="sm"
                  variant={pageNumber === pagination.page ? 'default' : 'secondary'}
                  aria-current={pageNumber === pagination.page ? 'page' : undefined}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!pagination.hasNext}
                onClick={() => setPage((current: number) => current + 1)}
              >
                Next<ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {editingEventType && (
        <EditEventDialog
          eventType={editingEventType}
          event={editingEvent}
          unitType={editingUnitType}
          open={editingEvent !== null}
          onOpenChange={(open: boolean) => { if (!open) setEditingEvent(null); }}
          onChanged={() => { setEditingEvent(null); refresh(); }}
        />
      )}
    </>
  );
}
