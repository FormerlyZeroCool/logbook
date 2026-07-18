import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerEventRoutes } from './routes/events.js';
import type { EventRow } from './serializers.js';

type EndTarget = {
  id: string;
  event_type_id: string;
  started_at: Date;
  ended_at: Date | null;
  event_kind: 'point' | 'duration';
  value: number | null;
  input_value: number | null;
  input_unit_id: string | null;
};

type EndTargetInput = Pick<EndTarget, 'id' | 'started_at' | 'ended_at' | 'event_kind'>
  & Partial<Pick<EndTarget, 'event_type_id' | 'value' | 'input_value' | 'input_unit_id'>>;


type EventTypeFixture = {
  id: string;
  key: string;
  is_active: boolean;
  unit_type_id: string | null;
  unit_type_key: string | null;
  default_unit_id: string | null;
  default_unit_key: string | null;
};

type UnitFixture = {
  id: string;
  key: string;
  unit_type_id: string;
  scale_to_base: number;
  offset_to_base: number;
};

const unitlessEventType: EventTypeFixture = {
  id: 'dc18ef60-e4d8-47fc-a728-82a0b6fa2d72',
  key: 'dog_walk',
  is_active: true,
  unit_type_id: null,
  unit_type_key: null,
  default_unit_id: null,
  default_unit_key: null
};

type TestState = {
  target: EndTarget | null;
  updated: boolean;
  updateValues: unknown[] | null;
  concurrentCompletionAt: Date | null;
  fetchValues: unknown[] | null;
};

function queryResult<Row extends QueryResultRow>(rows: Row[], command: string = 'SELECT'): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function makeEventRow(target: EndTarget, eventTypeFixture: EventTypeFixture): EventRow {
  return {
    id: target.id,
    event_type_id: eventTypeFixture.id,
    event_type: 'dog_walk',
    event_type_name: 'Dog walk',
    event_kind: target.event_kind,
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
    input_value: target.input_value,
    input_unit_id: target.input_unit_id,
    input_unit_key: null,
    input_unit_name: null,
    input_unit_symbol: null,
    input_unit_scale_to_base: null,
    input_unit_offset_to_base: null,
    started_at: target.started_at,
    ended_at: target.ended_at,
    value: target.value,
    text_value: null,
    note: 'Evening walk',
    metadata: {},
    duration_seconds: target.ended_at === null
      ? null
      : (target.ended_at.getTime() - target.started_at.getTime()) / 1_000,
    created_at: target.started_at,
    updated_at: target.ended_at ?? target.started_at
  };
}

async function buildTestApp(
  initialTarget: EndTargetInput | null,
  concurrentCompletionAt: Date | null = null,
  eventTypeFixture: EventTypeFixture = unitlessEventType,
  unitFixtures: UnitFixture[] = []
): Promise<{ app: FastifyInstance; state: TestState }> {
  const normalizedTarget: EndTarget | null = initialTarget === null ? null : {
    event_type_id: eventTypeFixture.id,
    value: null,
    input_value: null,
    input_unit_id: null,
    ...initialTarget
  };
  const state: TestState = {
    target: normalizedTarget,
    updated: false,
    updateValues: null,
    concurrentCompletionAt,
    fetchValues: null
  };

  const db = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
      if (sql.includes('SELECT id, event_type_id, started_at, ended_at, event_kind') && sql.includes('WHERE id = $1')) {
        return queryResult((state.target ? [state.target] : []) as unknown as Row[]);
      }
      if (sql.includes('FROM event_types t') && sql.includes('LEFT JOIN unit_types ut')) {
        return queryResult([eventTypeFixture] as unknown as Row[]);
      }
      if (sql.includes('FROM units') && sql.includes('WHERE unit_type_id = $1 AND key = $2')) {
        const unit = unitFixtures.find((candidate: UnitFixture): boolean => (
          candidate.unit_type_id === values?.[0] && candidate.key === values?.[1]
        ));
        return queryResult((unit ? [unit] : []) as unknown as Row[]);
      }
      if (sql.includes('WITH selected_target AS') && sql.includes('ended_at = $2')) {
        state.updateValues = values ?? null;
        if (!state.target || state.target.ended_at !== null) return queryResult([] as Row[], 'UPDATE');
        if (state.concurrentCompletionAt) {
          state.target = { ...state.target, ended_at: state.concurrentCompletionAt };
          return queryResult([] as Row[], 'UPDATE');
        }
        state.target = {
          ...state.target,
          ended_at: new Date(String(values?.[1])),
          value: (values?.[2] as number | null | undefined) ?? null,
          input_value: (values?.[3] as number | null | undefined) ?? null,
          input_unit_id: (values?.[4] as string | null | undefined) ?? null
        };
        state.updated = true;
        return queryResult([{ id: state.target.id, started_at: state.target.started_at }] as unknown as Row[], 'UPDATE');
      }
      if (sql.includes('JOIN event_types t ON t.id = e.event_type_id') && sql.includes('WHERE e.id = $1')) {
        state.fetchValues = values ?? null;
        if ((values?.length ?? 0) !== 1) return queryResult([] as Row[]);
        return queryResult((state.target ? [makeEventRow(state.target, eventTypeFixture)] : []) as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerEventRoutes(app, db);
  return { app, state };
}

const eventId = '4ebd3190-c347-4990-978d-709434726470';
const startedAt = new Date('2026-07-16T00:03:00.000Z');

describe('end event endpoint', () => {
  it('ends an ongoing duration event without round-tripping started_at through JavaScript', async (): Promise<void> => {
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: null,
      event_kind: 'duration'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: eventId,
      ongoing: false,
      startedAt: '2026-07-16T00:03:00.000Z',
      endedAt: '2026-07-16T00:04:09.631Z'
    });
    expect(state.updated).toBe(true);
    expect(state.updateValues).toEqual([
      eventId,
      '2026-07-16T00:04:09.631Z',
      null,
      null,
      null
    ]);
    expect(state.fetchValues).toEqual([eventId]);
    await app.close();
  });


  it('preserves the existing numeric value when completion omits value', async (): Promise<void> => {
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: null,
      event_kind: 'duration',
      value: 7,
      input_value: 7
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ value: 7, inputValue: 7 });
    expect(state.updateValues).toEqual([
      eventId,
      '2026-07-16T00:04:09.631Z',
      7,
      7,
      null
    ]);
    await app.close();
  });

  it('optionally stores a unitless numeric value while ending the event', async (): Promise<void> => {
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: null,
      event_kind: 'duration'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: {
        eventId,
        endedAt: '2026-07-16T00:04:09.631Z',
        value: 4.5
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: eventId,
      ongoing: false,
      value: 4.5,
      inputValue: 4.5
    });
    expect(state.updateValues).toEqual([
      eventId,
      '2026-07-16T00:04:09.631Z',
      4.5,
      4.5,
      null
    ]);
    await app.close();
  });

  it('normalizes a measured value through the event type unit catalog while ending', async (): Promise<void> => {
    const volumeUnitTypeId = '977be7a9-5e7f-448d-8a55-f77a9e80b40a';
    const milliliterId = '03c768f6-af08-44de-88e5-29091777eb63';
    const fluidOunceId = 'c39d96d7-4f50-467a-a3e5-b5d63ad279f6';
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: null,
      event_kind: 'duration'
    }, null, {
      id: unitlessEventType.id,
      key: 'feeding',
      is_active: true,
      unit_type_id: volumeUnitTypeId,
      unit_type_key: 'volume',
      default_unit_id: milliliterId,
      default_unit_key: 'ml'
    }, [{
      id: fluidOunceId,
      key: 'fl_oz_us',
      unit_type_id: volumeUnitTypeId,
      scale_to_base: 29.5735295625,
      offset_to_base: 0
    }]);

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: {
        eventId,
        endedAt: '2026-07-16T00:04:09.631Z',
        value: 8,
        unitKey: 'fl_oz_us'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(state.updateValues).toEqual([
      eventId,
      '2026-07-16T00:04:09.631Z',
      236.5882365,
      8,
      fluidOunceId
    ]);
    await app.close();
  });

  it('returns a specific validation error when endedAt precedes startedAt', async (): Promise<void> => {
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: new Date('2026-07-16T00:05:00.000Z'),
      ended_at: null,
      event_kind: 'duration'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'validation_error',
      message: 'endedAt must be at or after startedAt',
      startedAt: '2026-07-16T00:05:00.000Z',
      endedAt: '2026-07-16T00:04:09.631Z'
    });
    expect(state.updated).toBe(false);
    await app.close();
  });

  it('treats ending an already-ended event by UUID as idempotent', async (): Promise<void> => {
    const { app } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: new Date('2026-07-16T00:04:00.000Z'),
      event_kind: 'duration'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: eventId,
      ongoing: false,
      endedAt: '2026-07-16T00:04:00.000Z'
    });
    await app.close();
  });


  it('returns the completed event when another request wins the completion race', async (): Promise<void> => {
    const concurrentEndedAt = new Date('2026-07-16T00:04:09.631Z');
    const { app, state } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: null,
      event_kind: 'duration'
    }, concurrentEndedAt);

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: concurrentEndedAt.toISOString() }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: eventId,
      ongoing: false,
      endedAt: concurrentEndedAt.toISOString()
    });
    expect(state.updated).toBe(false);
    await app.close();
  });

  it('rejects ending a point event', async (): Promise<void> => {
    const { app } = await buildTestApp({
      id: eventId,
      started_at: startedAt,
      ended_at: startedAt,
      event_kind: 'point'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'conflict',
      message: 'Point events cannot be ended'
    });
    await app.close();
  });

  it('returns unknown event only when the UUID is absent', async (): Promise<void> => {
    const { app } = await buildTestApp(null);
    const response = await app.inject({
      method: 'POST',
      url: '/events/end',
      payload: { eventId, endedAt: '2026-07-16T00:04:09.631Z' }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: `Unknown event: ${eventId}`
    });
    await app.close();
  });
});
