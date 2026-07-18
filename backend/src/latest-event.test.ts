import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventTypeRoutes } from './routes/event-types.js';
import type { EventRow } from './serializers.js';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

function eventRow(): EventRow {
  const now = new Date('2026-07-15T12:00:00.000Z');
  return {
    id: '2d5b04e0-519f-4ec5-a999-6542e182b6ef',
    event_type_id: 'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
    event_type: 'water',
    event_type_name: 'Water',
    event_kind: 'point',
    unit_type_id: null,
    unit_type_key: null,
    unit_type_name: null,
    base_unit_id: null,
    base_unit_key: null,
    base_unit_name: null,
    base_unit_symbol: null,
    base_unit_scale_to_base: null,
    base_unit_offset_to_base: null,
    default_unit_id: null,
    default_unit_key: null,
    default_unit_name: null,
    default_unit_symbol: null,
    default_unit_scale_to_base: null,
    default_unit_offset_to_base: null,
    input_value: null,
    input_unit_id: null,
    input_unit_key: null,
    input_unit_name: null,
    input_unit_symbol: null,
    input_unit_scale_to_base: null,
    input_unit_offset_to_base: null,
    started_at: now,
    ended_at: now,
    value: null,
    text_value: null,
    note: null,
    metadata: {},
    duration_seconds: 0,
    created_at: now,
    updated_at: now
  };
}

async function buildTestApp(rows: EventRow[]): Promise<FastifyInstance> {
  const db = {
    query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
      if (sql.includes('ORDER BY e.started_at DESC, e.id DESC')) {
        return queryResult(rows as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerEventTypeRoutes(app, db);
  return app;
}

describe('latest event endpoint', () => {
  it('returns the most recent event for an event type key', async () => {
    const app = await buildTestApp([eventRow()]);
    const response = await app.inject({ method: 'GET', url: '/event-types/water/latest-event' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: '2d5b04e0-519f-4ec5-a999-6542e182b6ef',
      eventType: 'water',
      startedAt: '2026-07-15T12:00:00.000Z'
    });
    await app.close();
  });
});
