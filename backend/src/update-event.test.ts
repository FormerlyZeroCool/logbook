import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventRoutes } from './routes/events.js';
import type { EventRow } from './serializers.js';

type MutableEvent = EventRow;

function queryResult<Row extends QueryResultRow>(rows: Row[], command: string = 'SELECT'): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function makeEvent(kind: 'point' | 'duration'): MutableEvent {
  const startedAt = new Date('2026-07-16T12:00:00.000Z');
  const endedAt = kind === 'point' ? startedAt : new Date('2026-07-16T13:00:00.000Z');
  return {
    id: '4ebd3190-c347-4990-978d-709434726470',
    event_type_id: 'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
    event_type: 'dog_walk',
    event_type_name: 'Dog walk',
    event_kind: kind,
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
    started_at: startedAt,
    ended_at: endedAt,
    value: null,
    text_value: null,
    note: 'Old note',
    metadata: {},
    duration_seconds: kind === 'point' ? 0 : 3600,
    created_at: startedAt,
    updated_at: startedAt
  };
}

async function buildTestApp(kind: 'point' | 'duration'): Promise<{ app: FastifyInstance; event: MutableEvent; updateValues: () => unknown[] | null }> {
  const event = makeEvent(kind);
  let capturedUpdateValues: unknown[] | null = null;

  const db = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
      if (sql.includes('SELECT e.*') && sql.includes('WHERE e.id = $1')) {
        return queryResult([{
          event_type_id: event.event_type_id,
          event_kind: event.event_kind,
          started_at: event.started_at,
          ended_at: event.ended_at,
          value: event.value,
          input_value: event.input_value,
          input_unit_id: event.input_unit_id,
          text_value: event.text_value,
          note: event.note,
          metadata: event.metadata
        }] as unknown as Row[]);
      }
      if (sql.includes('FROM event_types t') && sql.includes('t.id = $1')) {
        return queryResult([{
          id: event.event_type_id,
          key: event.event_type,
          is_active: true,
          unit_type_id: null,
          unit_type_key: null,
          default_unit_id: null,
          default_unit_key: null
        }] as unknown as Row[]);
      }
      if (sql.includes('UPDATE events') && sql.includes('event_type_id = $2')) {
        capturedUpdateValues = values ?? null;
        event.started_at = new Date(String(values?.[2]));
        event.ended_at = values?.[3] === null ? null : new Date(String(values?.[3]));
        event.value = values?.[4] as number | null;
        event.input_value = values?.[5] as number | null;
        event.input_unit_id = values?.[6] as string | null;
        event.text_value = values?.[7] as string | null;
        event.note = values?.[8] as string | null;
        event.metadata = values?.[9] as Record<string, unknown>;
        event.duration_seconds = event.ended_at === null
          ? null
          : (event.ended_at.getTime() - event.started_at.getTime()) / 1_000;
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
  return { app, event, updateValues: (): unknown[] | null => capturedUpdateValues };
}

describe('update event endpoint', (): void => {
  it('updates a duration value, start, end, and note', async (): Promise<void> => {
    const { app, updateValues } = await buildTestApp('duration');
    const response = await app.inject({
      method: 'PATCH',
      url: '/events/4ebd3190-c347-4990-978d-709434726470',
      payload: {
        value: 7,
        startedAt: '2026-07-16T14:00:00.000Z',
        endedAt: '2026-07-16T15:30:00.000Z',
        note: 'Corrected event'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      value: 7,
      startedAt: '2026-07-16T14:00:00.000Z',
      endedAt: '2026-07-16T15:30:00.000Z',
      note: 'Corrected event',
      ongoing: false
    });
    expect(updateValues()).toEqual([
      '4ebd3190-c347-4990-978d-709434726470',
      'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
      '2026-07-16T14:00:00.000Z',
      '2026-07-16T15:30:00.000Z',
      7,
      7,
      null,
      null,
      'Corrected event',
      {}
    ]);
    await app.close();
  });

  it('can clear a duration end time to make the event ongoing', async (): Promise<void> => {
    const { app } = await buildTestApp('duration');
    const response = await app.inject({
      method: 'PATCH',
      url: '/events/4ebd3190-c347-4990-978d-709434726470',
      payload: { endedAt: null }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ endedAt: null, ongoing: true });
    await app.close();
  });

  it('moves both point timestamps when its start changes', async (): Promise<void> => {
    const { app } = await buildTestApp('point');
    const response = await app.inject({
      method: 'PATCH',
      url: '/events/4ebd3190-c347-4990-978d-709434726470',
      payload: { startedAt: '2026-07-16T16:00:00.000Z' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      startedAt: '2026-07-16T16:00:00.000Z',
      endedAt: '2026-07-16T16:00:00.000Z',
      ongoing: false
    });
    await app.close();
  });
});
