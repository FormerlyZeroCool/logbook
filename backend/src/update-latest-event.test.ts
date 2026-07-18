import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventRoutes } from './routes/events.js';
import type { EventRow } from './serializers.js';

function queryResult<Row extends QueryResultRow>(rows: Row[], command: string = 'SELECT'): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function makeEventRow(kind: 'point' | 'duration' = 'point'): EventRow {
  const startedAt = new Date('2026-07-15T12:00:00.000Z');
  const endedAt = kind === 'point' ? startedAt : new Date('2026-07-15T13:00:00.000Z');
  return {
    id: '2d5b04e0-519f-4ec5-a999-6542e182b6ef',
    event_type_id: 'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
    event_type: 'water',
    event_type_name: 'Water',
    event_kind: kind,
    unit_type_id: '583f99dd-fb48-455a-b08b-5f01d01d1a29',
    unit_type_key: 'volume',
    unit_type_name: 'Volume',
    base_unit_id: '6b633979-c783-455c-9c3c-54881a4482d6',
    base_unit_key: 'ml',
    base_unit_name: 'Milliliter',
    base_unit_symbol: 'mL',
    base_unit_scale_to_base: 1,
    base_unit_offset_to_base: 0,
    default_unit_id: '1c0a003d-f559-43f4-836b-388e51ad855a',
    default_unit_key: 'fl_oz_us',
    default_unit_name: 'US fluid ounce',
    default_unit_symbol: 'fl oz',
    default_unit_scale_to_base: 29.5735295625,
    default_unit_offset_to_base: 0,
    input_value: 8,
    input_unit_id: '1c0a003d-f559-43f4-836b-388e51ad855a',
    input_unit_key: 'fl_oz_us',
    input_unit_name: 'US fluid ounce',
    input_unit_symbol: 'fl oz',
    input_unit_scale_to_base: 29.5735295625,
    input_unit_offset_to_base: 0,
    started_at: startedAt,
    ended_at: endedAt,
    value: 236.5882365,
    text_value: null,
    note: 'Before correction',
    metadata: {},
    duration_seconds: kind === 'point' ? 0 : 3600,
    created_at: startedAt,
    updated_at: startedAt
  };
}

async function buildTestApp(kind: 'point' | 'duration' = 'point'): Promise<FastifyInstance> {
  const event = makeEventRow(kind);
  const db = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
      if (sql.includes('FROM event_types t') && sql.includes('WHERE t.key = $1')) {
        return queryResult([{ id: event.event_type_id, key: event.event_type, is_active: true,
          unit_type_id: event.unit_type_id, unit_type_key: event.unit_type_key,
          default_unit_id: event.default_unit_id, default_unit_key: event.default_unit_key }] as unknown as Row[]);
      }
      if (sql.includes('FROM events e') && sql.includes('ORDER BY e.started_at DESC, e.id DESC') && !sql.includes('JOIN event_types')) {
        return queryResult([{ id: event.id, event_kind: event.event_kind, started_at: event.started_at,
          started_at_exact: new Date(event.started_at).toISOString(), ended_at: event.ended_at,
          value: event.value, input_value: event.input_value,
          input_unit_id: event.input_unit_id, text_value: event.text_value,
          note: event.note, metadata: event.metadata }] as unknown as Row[]);
      }
      if (sql.includes('FROM units') && sql.includes('WHERE unit_type_id = $1 AND key = $2')) {
        const unitKey = values?.[1];
        if (unitKey !== 'tbsp_us') return queryResult([] as Row[]);
        return queryResult([{ id: 'df078da2-a43a-42c0-93c4-7d99121a0bd3', key: 'tbsp_us',
          unit_type_id: event.unit_type_id, scale_to_base: 14.78676478125, offset_to_base: 0 }] as unknown as Row[]);
      }
      if (sql.includes('UPDATE events') && sql.includes('started_at = COALESCE($3::timestamptz')) {
        if (values?.[2] !== null && values?.[2] !== undefined) {
          event.started_at = new Date(values[2] as string);
          if (event.event_kind === 'point') event.ended_at = event.started_at;
        }
        event.value = values?.[3] as number | null;
        event.input_value = values?.[4] as number | null;
        event.input_unit_id = values?.[5] as string | null;
        if (values?.[4] !== null && values?.[4] !== undefined) {
          event.input_unit_key = 'tbsp_us';
          event.input_unit_name = 'US tablespoon';
          event.input_unit_symbol = 'tbsp';
          event.input_unit_scale_to_base = 14.78676478125;
        }
        event.text_value = values?.[6] as string | null;
        event.note = values?.[7] as string | null;
        event.metadata = values?.[8] as Record<string, unknown>;
        event.duration_seconds = event.ended_at === null
          ? null
          : (new Date(event.ended_at).getTime() - new Date(event.started_at).getTime()) / 1000;
        event.updated_at = new Date('2026-07-15T12:05:00.000Z');
        return queryResult([{ id: event.id, started_at: event.started_at }] as unknown as Row[], 'UPDATE');
      }
      if (sql.includes('JOIN event_types t ON t.id = e.event_type_id') && sql.includes('WHERE e.id = $1')) {
        return queryResult([event] as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerEventRoutes(app, db);
  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error.message === 'endedAt must be at or after startedAt') {
      return reply.code(400).send({ error: 'validation_error', message: error.message });
    }
    return reply.code(500).send({ error: 'internal_error', message: error.message });
  });
  return app;
}

describe('update latest event endpoint', () => {
  it('updates and normalizes the newest event value and note', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'PATCH', url: '/event-types/water/latest-event',
      payload: { value: 3, unitKey: 'tbsp_us', note: 'Corrected amount' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ eventType: 'water', canonicalValue: 44.36029434375,
      inputValue: 3, note: 'Corrected amount', inputUnit: { key: 'tbsp_us' } });
    await app.close();
  });

  it('moves a point event start and end together', async () => {
    const app = await buildTestApp('point');
    const response = await app.inject({
      method: 'PATCH',
      url: '/event-types/water/latest-event',
      payload: { startedAt: '2026-07-15T11:45:00.000Z' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventKind: 'point',
      startedAt: '2026-07-15T11:45:00.000Z',
      endedAt: '2026-07-15T11:45:00.000Z',
      durationSeconds: 0
    });
    await app.close();
  });

  it('changes a duration start while preserving its existing end', async () => {
    const app = await buildTestApp('duration');
    const response = await app.inject({
      method: 'PATCH',
      url: '/event-types/water/latest-event',
      payload: { startedAt: '2026-07-15T11:30:00.000Z' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventKind: 'duration',
      startedAt: '2026-07-15T11:30:00.000Z',
      endedAt: '2026-07-15T13:00:00.000Z',
      durationSeconds: 5400
    });
    await app.close();
  });

  it('rejects a duration start after its existing end', async () => {
    const app = await buildTestApp('duration');
    const response = await app.inject({
      method: 'PATCH',
      url: '/event-types/water/latest-event',
      payload: { startedAt: '2026-07-15T13:30:00.000Z' }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'endedAt must be at or after startedAt' });
    await app.close();
  });
});
