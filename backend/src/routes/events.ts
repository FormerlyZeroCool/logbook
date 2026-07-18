import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabasePool } from '../db/pool.js';
import {
  assertEventTimeShape,
  durationEventStartSchema,
  eventEndSchema,
  eventListQuerySchema,
  eventTypeKeySchema,
  eventUpdateSchema,
  latestEventUpdateSchema,
  pointEventLogSchema
} from '../validation.js';
import { serializeEvent, type EventRow } from '../serializers.js';
import { EventValueValidationError, normalizeEventValue } from '../event-value-service.js';

type EventTypeReference = { eventTypeId?: string | undefined; eventTypeKey?: string | undefined };
type ResolvedEventType = {
  id: string;
  key: string;
  isActive: boolean;
  unitTypeId: string | null;
  unitTypeKey: string | null;
  defaultUnitId: string | null;
  defaultUnitKey: string | null;
};
type EventValues = {
  value?: number | null | undefined;
  unitKey?: string | null | undefined;
  textValue?: string | null | undefined;
  note?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};
type EventKind = 'point' | 'duration';

const eventSelect = `
  SELECT
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
  FROM events e
  JOIN event_types t ON t.id = e.event_type_id
  LEFT JOIN unit_types ut ON ut.id = t.unit_type_id
  LEFT JOIN units bu ON bu.unit_type_id = t.unit_type_id AND bu.is_base
  LEFT JOIN units du ON du.id = t.default_unit_id
  LEFT JOIN units iu ON iu.id = e.input_unit_id
`;

async function resolveEventType(db: DatabasePool, reference: EventTypeReference): Promise<ResolvedEventType | null> {
  const sql = `
    SELECT
      t.id,
      t.key,
      t.is_active,
      t.unit_type_id,
      ut.key AS unit_type_key,
      t.default_unit_id,
      du.key AS default_unit_key
    FROM event_types t
    LEFT JOIN unit_types ut ON ut.id = t.unit_type_id
    LEFT JOIN units du ON du.id = t.default_unit_id
    WHERE ${reference.eventTypeId ? 't.id = $1' : 't.key = $1'}
  `;
  const result = await db.query<{
    id: string;
    key: string;
    is_active: boolean;
    unit_type_id: string | null;
    unit_type_key: string | null;
    default_unit_id: string | null;
    default_unit_key: string | null;
  }>(sql, [reference.eventTypeId ?? reference.eventTypeKey]);

  const row = result.rows[0];
  return row ? {
    id: row.id,
    key: row.key,
    isActive: row.is_active,
    unitTypeId: row.unit_type_id,
    unitTypeKey: row.unit_type_key,
    defaultUnitId: row.default_unit_id,
    defaultUnitKey: row.default_unit_key
  } : null;
}

function typeReferenceDescription(reference: EventTypeReference): string {
  return reference.eventTypeId ?? reference.eventTypeKey ?? 'unknown';
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function normalizeInput(
  db: DatabasePool,
  eventType: ResolvedEventType,
  value: number | null | undefined,
  unitKey: string | null | undefined,
  reply: FastifyReply
) {
  try {
    return await normalizeEventValue({
      eventTypeKey: eventType.key,
      unitTypeId: eventType.unitTypeId,
      unitTypeKey: eventType.unitTypeKey,
      defaultUnitKey: eventType.defaultUnitKey
    }, value, unitKey, async (unitTypeId: string, selectedKey: string) => {
      const unitResult = await db.query<{
        id: string;
        key: string;
        unit_type_id: string;
        scale_to_base: number;
        offset_to_base: number;
      }>(`
        SELECT
          id,
          key,
          unit_type_id,
          scale_to_base::double precision AS scale_to_base,
          offset_to_base::double precision AS offset_to_base
        FROM units
        WHERE unit_type_id = $1 AND key = $2
      `, [unitTypeId, selectedKey]);
      const unit = unitResult.rows[0];
      return unit ? {
        id: unit.id,
        key: unit.key,
        unitTypeId: unit.unit_type_id,
        scaleToBase: Number(unit.scale_to_base),
        offsetToBase: Number(unit.offset_to_base)
      } : null;
    });
  } catch (error) {
    if (error instanceof EventValueValidationError) {
      reply.code(error.message.includes('has no default unit') ? 500 : 400).send({
        error: error.message.includes('has no default unit') ? 'configuration_error' : 'validation_error',
        message: error.message
      });
      return undefined;
    }
    throw error;
  }
}

async function fetchEvent(db: DatabasePool, id: string, startedAt?: string): Promise<EventRow | null> {
  const result = await db.query<EventRow>(`
    ${eventSelect}
    WHERE e.id = $1 ${startedAt ? 'AND e.started_at = $2::timestamptz' : ''}
    ORDER BY e.started_at DESC
    LIMIT 1
  `, startedAt ? [id, startedAt] : [id]);
  return result.rows[0] ?? null;
}

async function fetchEventAfterMutation(db: DatabasePool, id: string): Promise<EventRow> {
  const row = await fetchEvent(db, id);
  if (!row) {
    throw new Error(`Event ${id} could not be reloaded after mutation`);
  }
  return row;
}

async function insertEvent(
  db: DatabasePool,
  eventType: ResolvedEventType,
  eventKind: EventKind,
  startedAt: string,
  endedAt: string | null,
  values: EventValues,
  reply: FastifyReply
): Promise<EventRow | undefined> {
  assertEventTimeShape(eventKind, startedAt, endedAt);
  const normalized = await normalizeInput(db, eventType, values.value, values.unitKey, reply);
  if (!normalized) return undefined;

  const result = await db.query<{ id: string; started_at: Date }>(`
    INSERT INTO events(
      event_type_id, event_kind, started_at, ended_at, value, input_value, input_unit_id, text_value, note, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, started_at
  `, [
    eventType.id,
    eventKind,
    startedAt,
    endedAt,
    normalized.canonicalValue,
    normalized.inputValue,
    normalized.inputUnitId,
    values.textValue ?? null,
    values.note ?? null,
    values.metadata ?? {}
  ]);

  const inserted = result.rows[0]!;
  return fetchEventAfterMutation(db, inserted.id);
}

async function requireActiveEventType(
  db: DatabasePool,
  reference: EventTypeReference,
  reply: FastifyReply
): Promise<ResolvedEventType | null> {
  const eventType = await resolveEventType(db, reference);
  if (!eventType) {
    reply.code(404).send({
      error: 'not_found',
      message: `Unknown event type: ${typeReferenceDescription(reference)}`
    });
    return null;
  }
  if (!eventType.isActive) {
    reply.code(409).send({
      error: 'conflict',
      message: `Event type ${eventType.key} is archived and cannot accept new events`
    });
    return null;
  }
  return eventType;
}

export async function registerEventRoutes(app: FastifyInstance, db: DatabasePool): Promise<void> {
  app.get('/events', async (request: FastifyRequest) => {
    const query = eventListQuerySchema.parse(request.query);
    const requestedPage = query.page;
    const pageSize = query.pageSize ?? query.limit ?? 100;
    const conditions: string[] = [];
    const filterValues: unknown[] = [];

    if (query.eventTypeId) {
      filterValues.push(query.eventTypeId);
      conditions.push(`e.event_type_id = $${filterValues.length}`);
    }
    if (query.eventTypeKey) {
      filterValues.push(query.eventTypeKey);
      conditions.push(`t.key = $${filterValues.length}`);
    }
    if (query.from) {
      filterValues.push(query.from);
      conditions.push(`e.started_at >= $${filterValues.length}::timestamptz`);
    }
    if (query.to) {
      filterValues.push(query.to);
      conditions.push(`e.started_at <= $${filterValues.length}::timestamptz`);
    }
    if (query.before) {
      filterValues.push(query.before);
      conditions.push(`e.started_at < $${filterValues.length}::timestamptz`);
    }
    if (query.ongoing === true) conditions.push('e.ended_at IS NULL');
    if (query.ongoing === false) conditions.push('e.ended_at IS NOT NULL');
    if (query.note) {
      filterValues.push(query.note);
      conditions.push(`strpos(lower(COALESCE(e.note, '')), lower($${filterValues.length})) > 0`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await db.query<{ total: number }>(`
      SELECT COUNT(*)::int AS total
      FROM events e
      JOIN event_types t ON t.id = e.event_type_id
      ${where}
    `, filterValues);
    const total = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const values = [...filterValues, pageSize, offset];

    const result = await db.query<EventRow>(`
      ${eventSelect}
      ${where}
      ORDER BY e.started_at DESC, e.id DESC
      LIMIT $${filterValues.length + 1}
      OFFSET $${filterValues.length + 2}
    `, values);

    return {
      events: result.rows.map(serializeEvent),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages
      }
    };
  });

  app.get('/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id: string }).id;
    const row = await fetchEvent(db, id);
    if (!row) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event: ${id}` });
    }
    return serializeEvent(row);
  });

  app.post('/events/log', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = pointEventLogSchema.parse(request.body);
    const eventType = await requireActiveEventType(db, body, reply);
    if (!eventType) return;

    const occurredAt = body.occurredAt ?? new Date().toISOString();
    const row = await insertEvent(db, eventType, 'point', occurredAt, occurredAt, body, reply);
    if (!row) return;
    return reply.code(201).send(serializeEvent(row));
  });

  app.post('/events/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = durationEventStartSchema.parse(request.body);
    const eventType = await requireActiveEventType(db, body, reply);
    if (!eventType) return;

    const startedAt = body.startedAt ?? new Date().toISOString();
    const row = await insertEvent(db, eventType, 'duration', startedAt, null, body, reply);
    if (!row) return;
    return reply.code(201).send(serializeEvent(row));
  });

  app.patch('/event-types/:key/latest-event', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const body = latestEventUpdateSchema.parse(request.body);
    const eventType = await resolveEventType(db, { eventTypeKey: key });
    if (!eventType) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }

    const currentResult = await db.query<{
      id: string;
      event_kind: EventKind;
      started_at: Date;
      started_at_exact: string;
      ended_at: Date | null;
      value: number | null;
      input_value: number | null;
      input_unit_id: string | null;
      text_value: string | null;
      note: string | null;
      metadata: Record<string, unknown>;
    }>(`
      SELECT
        e.id,
        e.event_kind,
        e.started_at,
        e.started_at::text AS started_at_exact,
        e.ended_at,
        e.value,
        e.input_value,
        e.input_unit_id,
        e.text_value,
        e.note,
        e.metadata
      FROM events e
      WHERE e.event_type_id = $1
      ORDER BY e.started_at DESC, e.id DESC
      LIMIT 1
    `, [eventType.id]);

    const current = currentResult.rows[0];
    if (!current) {
      return reply.code(404).send({
        error: 'not_found',
        message: `No events have been recorded for event type: ${key}`
      });
    }

    if (body.startedAt !== undefined) {
      const endedAt = current.event_kind === 'point'
        ? body.startedAt
        : (current.ended_at ? asIso(current.ended_at) : null);
      assertEventTimeShape(current.event_kind, body.startedAt, endedAt);
    }

    let canonicalValue = current.value;
    let inputValue = current.input_value;
    let inputUnitId = current.input_unit_id;
    if (body.value !== undefined) {
      const normalized = await normalizeInput(db, eventType, body.value, body.unitKey, reply);
      if (!normalized) return;
      canonicalValue = normalized.canonicalValue;
      inputValue = normalized.inputValue;
      inputUnitId = normalized.inputUnitId;
    }

    const updated = await db.query<{ id: string; started_at: Date }>(`
      UPDATE events
      SET
        started_at = COALESCE($3::timestamptz, started_at),
        ended_at = CASE
          WHEN $3::timestamptz IS NOT NULL AND event_kind = 'point' THEN $3::timestamptz
          ELSE ended_at
        END,
        value = $4,
        input_value = $5,
        input_unit_id = $6,
        text_value = $7,
        note = $8,
        metadata = $9
      WHERE id = $1 AND started_at = $2::timestamptz
      RETURNING id, started_at
    `, [
      current.id,
      current.started_at_exact,
      body.startedAt ?? null,
      canonicalValue,
      inputValue,
      inputUnitId,
      body.textValue === undefined ? current.text_value : body.textValue,
      body.note === undefined ? current.note : body.note,
      body.metadata === undefined ? current.metadata : body.metadata
    ]);

    const row = updated.rows[0];
    if (!row) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'The latest event changed while it was being updated; try again'
      });
    }
    return serializeEvent(await fetchEventAfterMutation(db, row.id));
  });

  app.patch('/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id: string }).id;
    const body = eventUpdateSchema.parse(request.body);
    const currentResult = await db.query<{
      event_type_id: string;
      event_kind: EventKind;
      started_at: Date;
      ended_at: Date | null;
      value: number | null;
      input_value: number | null;
      input_unit_id: string | null;
      text_value: string | null;
      note: string | null;
      metadata: Record<string, unknown>;
    }>(`
      SELECT e.*
      FROM events e
      WHERE e.id = $1
      ORDER BY e.started_at DESC
      LIMIT 1
    `, [id]);

    if (!currentResult.rowCount) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event: ${id}` });
    }

    const current = currentResult.rows[0]!;
    let eventType = await resolveEventType(db, { eventTypeId: current.event_type_id });
    if (!eventType) {
      return reply.code(500).send({ error: 'configuration_error', message: 'The event references a missing event type' });
    }
    const changingType = body.eventTypeId !== undefined || body.eventTypeKey !== undefined;
    if (changingType) {
      const resolved = await requireActiveEventType(db, body, reply);
      if (!resolved) return;
      eventType = resolved;
      if (current.input_value !== null && body.value === undefined) {
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Provide value and optional unitKey when moving a numeric event to another event type'
        });
      }
    }

    const startedAt = body.startedAt ?? asIso(current.started_at);
    let endedAt: string | null;
    if (current.event_kind === 'point') {
      if (body.endedAt === null) {
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Point events cannot be made ongoing'
        });
      }
      endedAt = body.endedAt ?? startedAt;
    } else {
      endedAt = body.endedAt === undefined
        ? (current.ended_at ? asIso(current.ended_at) : null)
        : body.endedAt;
    }
    assertEventTimeShape(current.event_kind, startedAt, endedAt);

    let canonicalValue = current.value;
    let inputValue = current.input_value;
    let inputUnitId = current.input_unit_id;
    if (body.value !== undefined) {
      const normalized = await normalizeInput(db, eventType, body.value, body.unitKey, reply);
      if (!normalized) return;
      canonicalValue = normalized.canonicalValue;
      inputValue = normalized.inputValue;
      inputUnitId = normalized.inputUnitId;
    }

    const updated = await db.query<{ id: string; started_at: Date }>(`
      UPDATE events
      SET
        event_type_id = $2,
        started_at = $3,
        ended_at = $4,
        value = $5,
        input_value = $6,
        input_unit_id = $7,
        text_value = $8,
        note = $9,
        metadata = $10
      WHERE id = $1
      RETURNING id, started_at
    `, [
      id,
      eventType.id,
      startedAt,
      endedAt,
      canonicalValue,
      inputValue,
      inputUnitId,
      body.textValue === undefined ? current.text_value : body.textValue,
      body.note === undefined ? current.note : body.note,
      body.metadata === undefined ? current.metadata : body.metadata
    ]);

    const row = updated.rows[0]!;
    return serializeEvent(await fetchEventAfterMutation(db, row.id));
  });

  app.post('/events/end', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = eventEndSchema.parse(request.body);
    const endedAt = body.endedAt ?? new Date().toISOString();

    type EndTarget = {
      id: string;
      event_type_id: string;
      started_at: Date;
      ended_at: Date | null;
      event_kind: EventKind;
      value: number | null;
      input_value: number | null;
      input_unit_id: string | null;
    };

    let target: EndTarget | undefined;
    if (body.eventId) {
      const targetResult = await db.query<EndTarget>(`
        SELECT id, event_type_id, started_at, ended_at, event_kind, value, input_value, input_unit_id
        FROM events
        WHERE id = $1
        ORDER BY started_at DESC
        LIMIT 1
      `, [body.eventId]);
      target = targetResult.rows[0];
      if (!target) {
        return reply.code(404).send({
          error: 'not_found',
          message: `Unknown event: ${body.eventId}`
        });
      }
    } else {
      const eventType = await resolveEventType(db, body);
      if (!eventType) {
        return reply.code(404).send({
          error: 'not_found',
          message: `Unknown event type: ${typeReferenceDescription(body)}`
        });
      }
      const targetResult = await db.query<EndTarget>(`
        SELECT id, event_type_id, started_at, ended_at, event_kind, value, input_value, input_unit_id
        FROM events
        WHERE event_type_id = $1
          AND event_kind = 'duration'
          AND ended_at IS NULL
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      `, [eventType.id]);
      target = targetResult.rows[0];
      if (!target) {
        return reply.code(404).send({
          error: 'not_found',
          message: `No ongoing duration event was found for event type: ${eventType.key}`
        });
      }
    }

    if (target.event_kind !== 'duration') {
      return reply.code(409).send({
        error: 'conflict',
        message: 'Point events cannot be ended'
      });
    }
    if (target.ended_at !== null) {
      if (body.eventId) {
        const current = await fetchEvent(db, target.id);
        if (current) return serializeEvent(current);
      }
      return reply.code(409).send({
        error: 'conflict',
        message: 'The event has already ended',
        endedAt: asIso(target.ended_at)
      });
    }

    const startedAt = asIso(target.started_at);
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'endedAt must be at or after startedAt',
        startedAt,
        endedAt
      });
    }

    let canonicalValue = target.value;
    let inputValue = target.input_value;
    let inputUnitId = target.input_unit_id;
    if (body.value !== undefined) {
      const eventType = await resolveEventType(db, { eventTypeId: target.event_type_id });
      if (!eventType) {
        return reply.code(500).send({
          error: 'configuration_error',
          message: 'The event references a missing event type'
        });
      }
      const normalized = await normalizeInput(db, eventType, body.value, body.unitKey, reply);
      if (!normalized) return;
      canonicalValue = normalized.canonicalValue;
      inputValue = normalized.inputValue;
      inputUnitId = normalized.inputUnitId;
    }

    const result = await db.query<{ id: string; started_at: Date }>(`
      WITH selected_target AS (
        SELECT id, started_at
        FROM events
        WHERE id = $1
        ORDER BY started_at DESC
        LIMIT 1
      )
      UPDATE events e
      SET
        ended_at = $2,
        value = $3,
        input_value = $4,
        input_unit_id = $5
      FROM selected_target target_row
      WHERE e.id = target_row.id
        AND e.started_at = target_row.started_at
        AND e.event_kind = 'duration'
        AND e.ended_at IS NULL
      RETURNING e.id, e.started_at
    `, [target.id, endedAt, canonicalValue, inputValue, inputUnitId]);

    if (!result.rowCount) {
      const current = await fetchEvent(db, target.id);
      if (!current) {
        return reply.code(404).send({
          error: 'not_found',
          message: `Unknown event: ${target.id}`
        });
      }
      if (current.ended_at !== null) {
        return serializeEvent(current);
      }
      return reply.code(409).send({
        error: 'conflict',
        message: 'The event could not be completed because its state changed concurrently'
      });
    }
    const row = result.rows[0]!;
    return serializeEvent(await fetchEventAfterMutation(db, row.id));
  });

  app.delete('/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id: string }).id;
    const result = await db.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event: ${id}` });
    }
    return reply.code(204).send();
  });
}
