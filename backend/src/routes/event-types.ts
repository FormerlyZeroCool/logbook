import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabasePool } from '../db/pool.js';
import { hasPostgreSqlErrorCode } from '../db/errors.js';
import { eventTypeCreateSchema, eventTypeKeySchema, eventTypeUpdateSchema } from '../validation.js';
import { serializeEvent, serializeEventType, type EventRow, type EventTypeRow } from '../serializers.js';

type UnitSelection = { unitTypeId: string; defaultUnitId: string };

type EventTypeStatsRow = EventTypeRow & {
  total_events: number;
  point_events: number;
  duration_events: number;
  numeric_events: number;
  ongoing_events: number;
  latest_started_at: Date | null;
  latest_ended_at: Date | null;
};

type EventTypeWithRecentEvents = EventTypeStatsRow & { recent_events: EventRow[] };

const eventTypeUnitColumns = `
  ut.key AS unit_type_key,
  ut.name AS unit_type_name,
  bu.id AS base_unit_id,
  bu.key AS base_unit_key,
  bu.name AS base_unit_name,
  bu.symbol AS base_unit_symbol,
  bu.scale_to_base::double precision AS base_unit_scale_to_base,
  bu.offset_to_base::double precision AS base_unit_offset_to_base,
  du.key AS default_unit_key,
  du.name AS default_unit_name,
  du.symbol AS default_unit_symbol,
  du.scale_to_base::double precision AS default_unit_scale_to_base,
  du.offset_to_base::double precision AS default_unit_offset_to_base
`;

const eventUnitJoins = `
  LEFT JOIN unit_types ut ON ut.id = t.unit_type_id
  LEFT JOIN units bu ON bu.unit_type_id = t.unit_type_id AND bu.is_base
  LEFT JOIN units du ON du.id = t.default_unit_id
`;

const recentEventColumns = `
  e.id,
  e.event_type_id,
  t.key AS event_type,
  t.name AS event_type_name,
  e.event_kind,
  t.unit_type_id,
  ut.key AS unit_type_key,
  ut.name AS unit_type_name,
  bu.id AS base_unit_id,
  bu.key AS base_unit_key,
  bu.name AS base_unit_name,
  bu.symbol AS base_unit_symbol,
  bu.scale_to_base::double precision AS base_unit_scale_to_base,
  bu.offset_to_base::double precision AS base_unit_offset_to_base,
  t.default_unit_id,
  du.key AS default_unit_key,
  du.name AS default_unit_name,
  du.symbol AS default_unit_symbol,
  du.scale_to_base::double precision AS default_unit_scale_to_base,
  du.offset_to_base::double precision AS default_unit_offset_to_base,
  e.input_value,
  e.input_unit_id,
  iu.key AS input_unit_key,
  iu.name AS input_unit_name,
  iu.symbol AS input_unit_symbol,
  iu.scale_to_base::double precision AS input_unit_scale_to_base,
  iu.offset_to_base::double precision AS input_unit_offset_to_base,
  e.started_at,
  e.ended_at,
  e.value,
  e.text_value,
  e.note,
  e.metadata,
  e.duration_seconds,
  CASE WHEN e.ended_at IS NULL
    THEN EXTRACT(EPOCH FROM (now() - e.started_at))::double precision
    ELSE NULL
  END AS live_duration_seconds,
  e.created_at,
  e.updated_at
`;

async function resolveUnitSelection(
  db: DatabasePool,
  unitTypeKey: string | null | undefined,
  defaultUnitKey: string | null | undefined,
  reply: FastifyReply
): Promise<UnitSelection | null | undefined> {
  if (unitTypeKey == null) return null;

  const result = await db.query<{ unit_type_id: string; default_unit_id: string }>(`
    SELECT ut.id AS unit_type_id, selected.id AS default_unit_id
    FROM unit_types ut
    JOIN units selected
      ON selected.unit_type_id = ut.id
     AND selected.key = COALESCE(
       $2,
       (SELECT base.key FROM units base WHERE base.unit_type_id = ut.id AND base.is_base)
     )
    WHERE ut.key = $1
  `, [unitTypeKey, defaultUnitKey ?? null]);

  if (!result.rowCount) {
    reply.code(400).send({
      error: 'validation_error',
      message: defaultUnitKey
        ? `Unknown unit ${defaultUnitKey} for unit type ${unitTypeKey}`
        : `Unknown unit type or missing base unit: ${unitTypeKey}`
    });
    return undefined;
  }

  return {
    unitTypeId: result.rows[0]!.unit_type_id,
    defaultUnitId: result.rows[0]!.default_unit_id
  };
}

async function getEventType(db: DatabasePool, key: string): Promise<EventTypeStatsRow | null> {
  const result = await db.query<EventTypeStatsRow>(`
    SELECT
      t.*,
      ${eventTypeUnitColumns},
      COALESCE(s.total_events, 0)::int AS total_events,
      COALESCE(s.point_events, 0)::int AS point_events,
      COALESCE(s.duration_events, 0)::int AS duration_events,
      COALESCE(s.numeric_events, 0)::int AS numeric_events,
      COALESCE(s.ongoing_events, 0)::int AS ongoing_events,
      s.latest_started_at,
      s.latest_ended_at
    FROM event_types t
    ${eventUnitJoins}
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE e.event_kind = 'point')::int AS point_events,
        COUNT(*) FILTER (WHERE e.event_kind = 'duration')::int AS duration_events,
        COUNT(*) FILTER (WHERE e.value IS NOT NULL)::int AS numeric_events,
        COUNT(*) FILTER (WHERE e.ended_at IS NULL)::int AS ongoing_events,
        MAX(e.started_at) AS latest_started_at,
        MAX(e.ended_at) AS latest_ended_at
      FROM events e
      WHERE e.event_type_id = t.id
    ) s ON true
    WHERE t.key = $1
  `, [key]);
  return result.rows[0] ?? null;
}

export async function registerEventTypeRoutes(app: FastifyInstance, db: DatabasePool): Promise<void> {
  app.get('/event-types', async (request: FastifyRequest) => {
    const query = request.query as { recentLimit?: string; includeInactive?: string };
    const recentLimit = Math.min(Math.max(Number(query.recentLimit ?? 5) || 5, 0), 20);
    const includeInactive = query.includeInactive === 'true';

    const result = await db.query<EventTypeWithRecentEvents>(`
      SELECT
        t.*,
        ${eventTypeUnitColumns},
        COALESCE(s.total_events, 0)::int AS total_events,
        COALESCE(s.point_events, 0)::int AS point_events,
      COALESCE(s.duration_events, 0)::int AS duration_events,
      COALESCE(s.numeric_events, 0)::int AS numeric_events,
        COALESCE(s.ongoing_events, 0)::int AS ongoing_events,
        s.latest_started_at,
        s.latest_ended_at,
        COALESCE(r.recent_events, '[]'::json) AS recent_events
      FROM event_types t
      ${eventUnitJoins}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE e.event_kind = 'point')::int AS point_events,
        COUNT(*) FILTER (WHERE e.event_kind = 'duration')::int AS duration_events,
        COUNT(*) FILTER (WHERE e.value IS NOT NULL)::int AS numeric_events,
          COUNT(*) FILTER (WHERE e.ended_at IS NULL)::int AS ongoing_events,
          MAX(e.started_at) AS latest_started_at,
          MAX(e.ended_at) AS latest_ended_at
        FROM events e
        WHERE e.event_type_id = t.id
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(row_to_json(recent_row) ORDER BY recent_row.started_at DESC) AS recent_events
        FROM (
          SELECT ${recentEventColumns}
          FROM events e
          LEFT JOIN units iu ON iu.id = e.input_unit_id
          WHERE e.event_type_id = t.id
          ORDER BY e.started_at DESC
          LIMIT $1
        ) recent_row
      ) r ON true
      WHERE ($2::boolean OR t.is_active)
      ORDER BY t.is_active DESC, t.name ASC
    `, [recentLimit, includeInactive]);

    return {
      eventTypes: result.rows.map((row: EventTypeWithRecentEvents) => ({
        ...serializeEventType(row),
        recentEvents: row.recent_events.map(serializeEvent)
      }))
    };
  });

  app.get('/event-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const row = await getEventType(db, key);
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }
    return serializeEventType(row);
  });

  app.get('/event-types/:key/latest-event', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const result = await db.query<EventRow>(`
      SELECT ${recentEventColumns}
      FROM event_types t
      ${eventUnitJoins}
      JOIN events e ON e.event_type_id = t.id
      LEFT JOIN units iu ON iu.id = e.input_unit_id
      WHERE t.key = $1
      ORDER BY e.started_at DESC, e.id DESC
      LIMIT 1
    `, [key]);

    const row = result.rows[0];
    if (row) return serializeEvent(row);

    const eventType = await getEventType(db, key);
    if (!eventType) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }
    return reply.code(404).send({
      error: 'not_found',
      message: `No events have been recorded for event type: ${key}`
    });
  });

  app.post('/event-types', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = eventTypeCreateSchema.parse(request.body);
    const selection = await resolveUnitSelection(db, body.unitTypeKey, body.defaultUnitKey, reply);
    if (selection === undefined) return;

    try {
      const result = await db.query<EventTypeRow>(`
        INSERT INTO event_types(
          key, name, description, unit_type_id, default_unit_id, icon, color, voice_aliases
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        body.key,
        body.name,
        body.description ?? null,
        selection?.unitTypeId ?? null,
        selection?.defaultUnitId ?? null,
        body.icon ?? null,
        body.color ?? null,
        body.voiceAliases ?? []
      ]);
      const created = await getEventType(db, result.rows[0]!.key);
      return reply.code(201).send(serializeEventType(created!));
    } catch (error: unknown) {
      if (hasPostgreSqlErrorCode(error, '23505')) {
        return reply.code(409).send({ error: 'conflict', message: `Event type ${body.key} already exists` });
      }
      throw error;
    }
  });

  app.patch('/event-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const body = eventTypeUpdateSchema.parse(request.body);
    const row = await getEventType(db, key);
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }

    const currentUnitTypeKey = row.unit_type_key;
    const requestedUnitTypeKey = body.unitTypeKey === undefined ? currentUnitTypeKey : body.unitTypeKey;
    let requestedDefaultUnitKey: string | null | undefined;
    if (requestedUnitTypeKey == null) {
      requestedDefaultUnitKey = null;
    } else if (body.defaultUnitKey !== undefined) {
      requestedDefaultUnitKey = body.defaultUnitKey;
    } else if (body.unitTypeKey !== undefined && body.unitTypeKey !== currentUnitTypeKey) {
      requestedDefaultUnitKey = undefined; // choose the new type's base unit
    } else {
      requestedDefaultUnitKey = row.default_unit_key;
    }

    if (body.defaultUnitKey != null && requestedUnitTypeKey == null) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'defaultUnitKey requires an event type measurement unit'
      });
    }

    if (requestedUnitTypeKey !== currentUnitTypeKey && row.numeric_events! > 0) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'The unit type cannot be changed after numeric values have been recorded. Create a new event type instead.'
      });
    }

    const selection = await resolveUnitSelection(db, requestedUnitTypeKey, requestedDefaultUnitKey, reply);
    if (selection === undefined) return;

    await db.query(`
      UPDATE event_types
      SET
        name = $2,
        description = $3,
        unit_type_id = $4,
        default_unit_id = $5,
        icon = $6,
        color = $7,
        voice_aliases = $8,
        is_active = $9,
        archived_at = CASE
          WHEN $9 = true THEN NULL
          WHEN $9 = false THEN COALESCE(archived_at, now())
          ELSE archived_at
        END
      WHERE key = $1
    `, [
      key,
      body.name ?? row.name,
      body.description === undefined ? row.description : body.description,
      selection?.unitTypeId ?? null,
      selection?.defaultUnitId ?? null,
      body.icon === undefined ? row.icon : body.icon,
      body.color === undefined ? row.color : body.color,
      body.voiceAliases === undefined ? (row.voice_aliases ?? []) : body.voiceAliases,
      body.isActive ?? row.is_active
    ]);

    return serializeEventType((await getEventType(db, key))!);
  });

  app.delete('/event-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const row = await getEventType(db, key);
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }
    if (row.total_events! > 0) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'Event types with recorded events cannot be deleted. Archive the type instead.'
      });
    }

    try {
      await db.query('DELETE FROM event_types WHERE id = $1', [row.id]);
      return reply.code(204).send();
    } catch (error: unknown) {
      if (hasPostgreSqlErrorCode(error, '23503')) {
        return reply.code(409).send({
          error: 'conflict',
          message: 'The event type became referenced and cannot be deleted. Archive it instead.'
        });
      }
      throw error;
    }
  });
}
