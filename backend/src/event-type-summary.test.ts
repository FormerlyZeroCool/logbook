import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventTypeRoutes } from './routes/event-types.js';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

async function buildTestApp(): Promise<{ app: FastifyInstance; rawSql: string[] }> {
  const rawSql: string[] = [];
  const db = {
    query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
      rawSql.push(sql);
      if (sql.includes('FROM event_types t') && sql.includes('recent_events')) {
        return queryResult([{
          id: 'b265a9df-619b-41f6-a439-82039abc8b61',
          key: 'feeding',
          name: 'Feeding',
          description: null,
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
          icon: null,
          color: null,
          is_active: true,
          archived_at: null,
          total_events: 3,
          point_events: 1,
          duration_events: 2,
          numeric_events: 3,
          ongoing_events: 1,
          latest_started_at: new Date('2026-07-16T19:45:00.000Z'),
          latest_ended_at: new Date('2026-07-16T19:30:00.000Z'),
          recent_events: [],
          created_at: new Date('2026-07-01T00:00:00.000Z'),
          updated_at: new Date('2026-07-16T19:45:00.000Z')
        }] as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerEventTypeRoutes(app, db);
  return { app, rawSql };
}

describe('event type activity timestamps', () => {
  it('returns independent latest start and latest completed finish timestamps', async () => {
    const { app, rawSql } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/event-types?recentLimit=5' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventTypes: [{
        latestStartedAt: '2026-07-16T19:45:00.000Z',
        latestEndedAt: '2026-07-16T19:30:00.000Z',
        ongoingEvents: 1
      }]
    });
    expect(rawSql[0]).toContain('MAX(e.started_at) AS latest_started_at');
    expect(rawSql[0]).toContain('MAX(e.ended_at) AS latest_ended_at');
    await app.close();
  });
});
