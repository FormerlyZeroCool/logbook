import type {
  AnalysisFunctionSummary, AnalysisProgramSummary, AnalysisQueryRequestV1, AnalysisQueryResponseV1,
  AnalysisValidationReport, CapabilitiesResponse, EventTypeSummary, ExplorationSummary, LogEvent,
  PaginatedEvents, SeriesResponse, UnitTypeDefinition
} from './types';
import { buildEventListSearchParams, type EventListQuery } from './event-list-query';
import { buildRequestHeaders } from './request-headers';

class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, headers: buildRequestHeaders(init) });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { const body = await response.json() as { message?: string }; if (body.message) message = body.message; } catch { /* keep status */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
type EventValueBody = { value?: number | null; unitKey?: string | null; textValue?: string | null; note?: string | null; metadata?: Record<string, unknown> };

export const api = {
  getCapabilities: () => request<CapabilitiesResponse>('/capabilities'),
  listUnitTypes: async () => (await request<{ unitTypes: UnitTypeDefinition[] }>('/unit-types')).unitTypes,
  getUnitType: (key: string) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(key)}`),
  createUnitType: (body: { key: string; name: string; description?: string | null; baseUnit: { key: string; name: string; symbol: string; aliases?: string[] } }) => request<UnitTypeDefinition>('/unit-types', { method: 'POST', body: JSON.stringify(body) }),
  updateUnitType: (key: string, body: { name?: string; description?: string | null }) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUnitType: (key: string) => request<void>(`/unit-types/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  createUnit: (typeKey: string, body: { key: string; name: string; symbol: string; scaleToBase: number; offsetToBase?: number; aliases?: string[] }) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(typeKey)}/units`, { method: 'POST', body: JSON.stringify(body) }),
  updateUnit: (typeKey: string, unitKey: string, body: { name?: string; symbol?: string; scaleToBase?: number; offsetToBase?: number; aliases?: string[] }) => request<UnitTypeDefinition>(`/unit-types/${encodeURIComponent(typeKey)}/units/${encodeURIComponent(unitKey)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUnit: (typeKey: string, unitKey: string) => request<void>(`/unit-types/${encodeURIComponent(typeKey)}/units/${encodeURIComponent(unitKey)}`, { method: 'DELETE' }),
  listEventTypes: async (recentLimit: number = 5, includeInactive: boolean = false) => (await request<{ eventTypes: EventTypeSummary[] }>(`/event-types?${new URLSearchParams({ recentLimit: String(recentLimit), includeInactive: String(includeInactive) })}`)).eventTypes,
  getEventType: (key: string) => request<EventTypeSummary>(`/event-types/${encodeURIComponent(key)}`),
  getLatestEvent: (key: string) => request<LogEvent>(`/event-types/${encodeURIComponent(key)}/latest-event`),
  updateLatestEvent: (key: string, body: EventValueBody & { startedAt?: string }) => request<LogEvent>(`/event-types/${encodeURIComponent(key)}/latest-event`, { method: 'PATCH', body: JSON.stringify(body) }),
  createEventType: (body: { key: string; name: string; description?: string | null; unitTypeKey?: string | null; defaultUnitKey?: string | null; icon?: string | null; color?: string | null }) => request<EventTypeSummary>('/event-types', { method: 'POST', body: JSON.stringify(body) }),
  updateEventType: (key: string, body: { name?: string; description?: string | null; unitTypeKey?: string | null; defaultUnitKey?: string | null; icon?: string | null; color?: string | null; isActive?: boolean }) => request<EventTypeSummary>(`/event-types/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEventType: (key: string) => request<void>(`/event-types/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  listEventsPage: (query: EventListQuery) => request<PaginatedEvents>(`/events?${buildEventListSearchParams(query)}`),
  listEvents: async (query: EventListQuery) => (await request<PaginatedEvents>(`/events?${buildEventListSearchParams(query)}`)).events,
  logPointEvent: (body: { eventTypeId: string; occurredAt?: string } & EventValueBody) => request<LogEvent>('/events/log', { method: 'POST', body: JSON.stringify(body) }),
  startDurationEvent: (body: { eventTypeId: string; startedAt?: string } & EventValueBody) => request<LogEvent>('/events/start', { method: 'POST', body: JSON.stringify(body) }),
  endEvent: (body: { eventId?: string; eventTypeId?: string; eventTypeKey?: string; endedAt?: string }) => request<LogEvent>('/events/end', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (id: string, body: { startedAt?: string; endedAt?: string | null } & EventValueBody) => request<LogEvent>(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent: (id: string) => request<void>(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getSeries: (key: string, from: string, to: string, bucket: string, timeZone: string, displayUnitKey?: string) => { const params = new URLSearchParams({ from, to, bucket, timeZone }); if (displayUnitKey) params.set('displayUnitKey', displayUnitKey); return request<SeriesResponse>(`/event-types/${encodeURIComponent(key)}/series?${params}`); },

  queryAnalysis: (body: AnalysisQueryRequestV1) => request<AnalysisQueryResponseV1>('/analysis/query', { method: 'POST', body: JSON.stringify(body) }),
  validateAnalysis: (body: { sourceBody: string; inputAliases: string[]; functionBindings?: unknown[] }) => request<AnalysisValidationReport>('/analysis/validate', { method: 'POST', body: JSON.stringify(body) }),
  listAnalysisPrograms: () => request<AnalysisProgramSummary[]>('/analysis/programs'),
  createAnalysisProgram: (body: { name: string; description?: string; editorMode: 'pipeline' | 'code' }) => request<AnalysisProgramSummary>('/analysis/programs', { method: 'POST', body: JSON.stringify(body) }),
  getAnalysisProgram: (id: string) => request<Record<string, unknown>>(`/analysis/programs/${encodeURIComponent(id)}`),
  updateAnalysisProgram: (id: string, body: Record<string, unknown>) => request<AnalysisProgramSummary>(`/analysis/programs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  duplicateAnalysisProgram: (id: string) => request<AnalysisProgramSummary>(`/analysis/programs/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  createAnalysisRevision: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/analysis/programs/${encodeURIComponent(id)}/revisions`, { method: 'POST', body: JSON.stringify(body) }),
  publishAnalysisRevision: (id: string, revisionId: string) => request<AnalysisProgramSummary>(`/analysis/programs/${encodeURIComponent(id)}/publish/${encodeURIComponent(revisionId)}`, { method: 'POST' }),
  deleteAnalysisProgram: (id: string) => request<void>(`/analysis/programs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listAnalysisFunctions: () => request<AnalysisFunctionSummary[]>('/analysis/functions'),
  createAnalysisFunction: (body: { functionKey: string; name: string; description?: string; functionKind: string }) => request<AnalysisFunctionSummary>('/analysis/functions', { method: 'POST', body: JSON.stringify(body) }),
  getAnalysisFunction: (id: string) => request<Record<string, unknown>>(`/analysis/functions/${encodeURIComponent(id)}`),
  updateAnalysisFunction: (id: string, body: Record<string, unknown>) => request<AnalysisFunctionSummary>(`/analysis/functions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  duplicateAnalysisFunction: (id: string) => request<AnalysisFunctionSummary>(`/analysis/functions/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  createAnalysisFunctionRevision: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/analysis/functions/${encodeURIComponent(id)}/revisions`, { method: 'POST', body: JSON.stringify(body) }),
  publishAnalysisFunctionRevision: (id: string, revisionId: string) => request<AnalysisFunctionSummary>(`/analysis/functions/${encodeURIComponent(id)}/publish/${encodeURIComponent(revisionId)}`, { method: 'POST' }),
  deleteAnalysisFunction: (id: string) => request<void>(`/analysis/functions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listExplorations: () => request<ExplorationSummary[]>('/explorations'),
  createExploration: (body: { programId: string; autoRun?: boolean; editorPreferences?: Record<string, unknown> }) => request<ExplorationSummary>('/explorations', { method: 'POST', body: JSON.stringify(body) }),
  getExploration: (id: string) => request<Record<string, unknown>>(`/explorations/${encodeURIComponent(id)}`),
  updateExploration: (id: string, body: Record<string, unknown>) => request<ExplorationSummary>(`/explorations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExploration: (id: string) => request<void>(`/explorations/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
