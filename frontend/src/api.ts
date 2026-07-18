import type { EventTypeSummary, LogEvent, PaginatedEvents, SeriesResponse, UnitTypeDefinition } from './types';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

import { buildEventListSearchParams, type EventListQuery } from './event-list-query';
import { buildRequestHeaders } from './request-headers';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: buildRequestHeaders(init)
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep the HTTP status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type EventValueBody = {
  value?: number | null;
  unitKey?: string | null;
  textValue?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

export const api = {
  listUnitTypes: async () => {
    const result = await request<{ unitTypes: UnitTypeDefinition[] }>('/unit-types');
    return result.unitTypes;
  },

  getUnitType: (key: string) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(key)}`),

  createUnitType: (body: {
    key: string;
    name: string;
    description?: string | null;
    baseUnit: { key: string; name: string; symbol: string; aliases?: string[] };
  }) => request<UnitTypeDefinition>('/unit-types', { method: 'POST', body: JSON.stringify(body) }),

  updateUnitType: (key: string, body: { name?: string; description?: string | null }) =>
    request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(key)}`, {
      method: 'PATCH', body: JSON.stringify(body)
    }),

  deleteUnitType: (key: string) => request<void>(`/unit-types/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  createUnit: (typeKey: string, body: {
    key: string;
    name: string;
    symbol: string;
    scaleToBase: number;
    offsetToBase?: number;
    aliases?: string[];
  }) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(typeKey)}/units`, {
    method: 'POST', body: JSON.stringify(body)
  }),

  updateUnit: (typeKey: string, unitKey: string, body: {
    name?: string;
    symbol?: string;
    scaleToBase?: number;
    offsetToBase?: number;
    aliases?: string[];
  }) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(typeKey)}/units/${encodeURIComponent(unitKey)}`, {
    method: 'PATCH', body: JSON.stringify(body)
  }),

  deleteUnit: (typeKey: string, unitKey: string) => request<void>(
    `/unit-types/${encodeURIComponent(typeKey)}/units/${encodeURIComponent(unitKey)}`,
    { method: 'DELETE' }
  ),

  listEventTypes: async (recentLimit: number = 5, includeInactive: boolean = false) => {
    const params = new URLSearchParams({
      recentLimit: String(recentLimit),
      includeInactive: String(includeInactive)
    });
    const result = await request<{ eventTypes: EventTypeSummary[] }>(`/event-types?${params}`);
    return result.eventTypes;
  },

  getEventType: (key: string) => request<EventTypeSummary>(`/event-types/${encodeURIComponent(key)}`),

  getLatestEvent: (key: string) => request<LogEvent>(`/event-types/${encodeURIComponent(key)}/latest-event`),

  updateLatestEvent: (key: string, body: EventValueBody & { startedAt?: string }) => request<LogEvent>(
    `/event-types/${encodeURIComponent(key)}/latest-event`,
    { method: 'PATCH', body: JSON.stringify(body) }
  ),

  createEventType: (body: {
    key: string;
    name: string;
    description?: string | null;
    unitTypeKey?: string | null;
    defaultUnitKey?: string | null;
    icon?: string | null;
    color?: string | null;
  }) => request<EventTypeSummary>('/event-types', { method: 'POST', body: JSON.stringify(body) }),

  updateEventType: (key: string, body: {
    name?: string;
    description?: string | null;
    unitTypeKey?: string | null;
    defaultUnitKey?: string | null;
    icon?: string | null;
    color?: string | null;
    isActive?: boolean;
  }) => request<EventTypeSummary>(`/event-types/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  }),

  deleteEventType: (key: string) => request<void>(`/event-types/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  }),

  listEventsPage: (query: EventListQuery) => {
    const params = buildEventListSearchParams(query);
    return request<PaginatedEvents>(`/events?${params}`);
  },

  listEvents: async (query: EventListQuery) => {
    const params = buildEventListSearchParams(query);
    const result = await request<PaginatedEvents>(`/events?${params}`);
    return result.events;
  },

  logPointEvent: (body: {
    eventTypeId: string;
    occurredAt?: string;
  } & EventValueBody) => request<LogEvent>('/events/log', { method: 'POST', body: JSON.stringify(body) }),

  startDurationEvent: (body: {
    eventTypeId: string;
    startedAt?: string;
  } & EventValueBody) => request<LogEvent>('/events/start', { method: 'POST', body: JSON.stringify(body) }),

  endEvent: (body: {
    eventId?: string;
    eventTypeId?: string;
    eventTypeKey?: string;
    endedAt?: string;
  }) => request<LogEvent>('/events/end', {
    method: 'POST',
    body: JSON.stringify(body)
  }),

  updateEvent: (id: string, body: {
    startedAt?: string;
    endedAt?: string | null;
  } & EventValueBody) => request<LogEvent>(`/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  }),

  deleteEvent: (id: string) => request<void>(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSeries: (
    key: string,
    from: string,
    to: string,
    bucket: string,
    timeZone: string,
    displayUnitKey?: string
  ) => {
    const params = new URLSearchParams({ from, to, bucket, timeZone });
    if (displayUnitKey) params.set('displayUnitKey', displayUnitKey);
    return request<SeriesResponse>(`/event-types/${encodeURIComponent(key)}/series?${params}`);
  }
};
