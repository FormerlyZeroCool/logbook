export type EventListQuery = {
  eventTypeId?: string;
  eventTypeKey?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  ongoing?: boolean;
  note?: string;
};

export function buildEventListSearchParams(query: EventListQuery): URLSearchParams {
  const params = new URLSearchParams();
  const entries = Object.entries(query) as Array<[string, string | number | boolean | undefined]>;
  for (const [key, value] of entries) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}
