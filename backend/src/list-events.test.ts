import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventRoutes } from './routes/events.js';
import type { EventRow } from './serializers.js';

function queryResult<Row extends QueryResultRow>(rows: Row[], command: string = 'SELECT'): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function makeEvent(id: string, startedAt: string, note: string): EventRow {
  const timestamp = new Date(startedAt);
  return {
    id,
    event_type_id: 'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
    event_type: 'feeding',
    event_type_name: 'Feeding',
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
    started_at: timestamp,
    ended_at: timestamp,
    value: null,
    text_value: null,
    note,
    metadata: {},
    duration_seconds: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
}

async function buildTestApp(total: number, events: EventRow[]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
      queries.push({ sql, values: values ?? [] });
      if (sql.includes('SELECT COUNT(*)::int AS total')) {
        return queryResult([{ total }] as unknown as Row[]);
      }
      if (sql.includes('ORDER BY e.started_at DESC, e.id DESC') && sql.includes('OFFSET')) {
        return queryResult(events as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app: FastifyInstance = Fastify();
  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'validation_error' });
    return reply.send(error);
  });
  await registerEventRoutes(app, db);
  return { app, queries };
}

describe('list events endpoint', () => {
  it('returns numbered pagination and searches notes case-insensitively', async () => {
    const { app, queries } = await buildTestApp(5, [
      makeEvent('2d5b04e0-519f-4ec5-a999-6542e182b6ef', '2026-07-15T12:00:00.000Z', 'Night feeding')
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/events?page=2&pageSize=2&note=Night%20feeding'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [{ note: 'Night feeding', eventType: 'feeding' }],
      pagination: {
        page: 2,
        pageSize: 2,
        total: 5,
        totalPages: 3,
        hasPrevious: true,
        hasNext: true
      }
    });
    expect(queries[0]?.sql).toContain("strpos(lower(COALESCE(e.note, '')), lower($1)) > 0");
    expect(queries[0]?.values).toEqual(['Night feeding']);
    expect(queries[1]?.values).toEqual(['Night feeding', 2, 2]);
    await app.close();
  });

  it('treats SQL wildcard characters in note searches as literal text', async () => {
    const { app, queries } = await buildTestApp(0, []);
    const response = await app.inject({
      method: 'GET',
      url: `/events?note=${encodeURIComponent('50%_done\\')}`
    });

    expect(response.statusCode).toBe(200);
    expect(queries[0]?.values).toEqual(['50%_done\\']);
    await app.close();
  });

  it('clamps an out-of-range page to the last available page', async () => {
    const { app, queries } = await buildTestApp(3, [
      makeEvent('2d5b04e0-519f-4ec5-a999-6542e182b6ef', '2026-07-15T12:00:00.000Z', 'Last page')
    ]);
    const response = await app.inject({ method: 'GET', url: '/events?page=99&pageSize=2' });

    expect(response.statusCode).toBe(200);
    expect(response.json().pagination).toMatchObject({ page: 2, totalPages: 2 });
    expect(queries[1]?.values).toEqual([2, 2]);
    await app.close();
  });

  it('rejects invalid pagination query values', async () => {
    const { app } = await buildTestApp(0, []);
    const response = await app.inject({ method: 'GET', url: '/events?page=0&pageSize=25' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
