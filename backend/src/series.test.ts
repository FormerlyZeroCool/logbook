import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerSeriesRoutes } from './routes/series.js';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

async function buildTestApp(): Promise<{ app: FastifyInstance; rawSql: string[]; rawParams: unknown[][] }> {
  const rawSql: string[] = [];
  const rawParams: unknown[][] = [];
  const db = {
    query: async <Row extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<Row>> => {
      rawSql.push(sql);
      rawParams.push(params);
      if (sql.includes('FROM event_types t') && sql.includes('LEFT JOIN unit_types')) {
        return queryResult([{
          key: 'feeding',
          name: 'Feeding',
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
          default_unit_offset_to_base: null
        }] as unknown as Row[]);
      }
      if (sql.includes('time_bucket(')) {
        return queryResult([{
          bucket: new Date('2026-07-16T04:00:00.000Z'),
          event_count: 1,
          value_avg: 4.5,
          value_min: 4.5,
          value_max: 4.5,
          value_sum: 4.5,
          duration_avg_seconds: 900,
          duration_min_seconds: 900,
          duration_max_seconds: 900,
          duration_sum_seconds: 900
        }] as unknown as Row[]);
      }
      if (sql.includes('ORDER BY e.started_at ASC')) {
        return queryResult([{
          id: '2d5b04e0-519f-4ec5-a999-6542e182b6ef',
          event_kind: 'duration',
          started_at: new Date('2026-07-16T10:05:00.000Z'),
          ended_at: new Date('2026-07-16T10:20:00.000Z'),
          value: 4.5,
          text_value: 'Left bottle',
          note: 'Finished calmly',
          duration_seconds: 900,
          ongoing: false
        }] as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerSeriesRoutes(app, db);
  return { app, rawSql, rawParams };
}

describe('series endpoint chart details', () => {
  it('returns value, note, text, and duration on raw event points', async () => {
    const { app, rawSql, rawParams } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/event-types/feeding/series?from=2026-07-16T10%3A00%3A00.000Z&to=2026-07-16T11%3A00%3A00.000Z&bucket=1%20day&timeZone=America%2FNew_York'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      points: [{ bucket: '2026-07-16T04:00:00.000Z' }],
      valuePoints: [{
        eventKind: 'duration',
        value: 4.5,
        textValue: 'Left bottle',
        note: 'Finished calmly',
        durationSeconds: 900,
        ongoing: false
      }],
      durationPoints: [{
        eventKind: 'duration',
        value: 4.5,
        textValue: 'Left bottle',
        note: 'Finished calmly',
        durationSeconds: 900,
        ongoing: false
      }]
    });
    expect(rawSql[2]).toContain('e.text_value');
    expect(rawSql[2]).toContain('e.note');
    expect(rawSql[1]).toContain(
      'timezone($5::text, time_bucket($4::interval, timezone($5::text, e.started_at)))'
    );
    expect(rawParams[1]).toEqual([
      'feeding',
      '2026-07-16T10:00:00.000Z',
      '2026-07-16T11:00:00.000Z',
      '1 day',
      'America/New_York'
    ]);
    expect(rawSql[2]).toContain('e.event_kind');
    await app.close();
  });

  it('keeps fixed-duration buckets UTC aligned without passing an unused timezone parameter', async () => {
    const { app, rawSql, rawParams } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/event-types/feeding/series?from=2026-07-16T10%3A00%3A00.000Z&to=2026-07-16T11%3A00%3A00.000Z&bucket=1%20hour&timeZone=America%2FNew_York'
    });

    expect(response.statusCode).toBe(200);
    expect(rawSql[1]).toContain('time_bucket($4::interval, e.started_at) AS bucket');
    expect(rawSql[1]).not.toContain('timezone($5::text, time_bucket');
    expect(rawParams[1]).toEqual([
      'feeding',
      '2026-07-16T10:00:00.000Z',
      '2026-07-16T11:00:00.000Z',
      '1 hour'
    ]);
    await app.close();
  });
});
