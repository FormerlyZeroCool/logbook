import type { PoolClient } from 'pg';
import type { AnalysisQueryRequestV1, AnalysisQueryResponseV1 } from '@logbook/analysis-sdk';
import type { AnalysisLimits } from '../config.js';
import type { DatabasePool } from '../db/pool.js';
import { fromBase } from '../unit-conversion.js';

type EventTypeUnitRow = {
  event_type_id: string;
  event_type_key: string;
  event_type_name: string;
  unit_id: string | null;
  unit_key: string | null;
  unit_symbol: string | null;
  unit_type_key: string | null;
  scale_to_base: string | null;
  offset_to_base: string | null;
};

type EventRow = {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  value: number | null;
  text_value: string | null;
  note: string | null;
  in_requested_range: boolean;
  day_bucket_start: Date;
  week_bucket_start: Date;
};

async function resolveInput(client: PoolClient, eventTypeKey: string, displayUnitKey?: string): Promise<EventTypeUnitRow> {
  const result = await client.query<EventTypeUnitRow>(`
    SELECT et.id AS event_type_id, et.key AS event_type_key, et.name AS event_type_name,
           u.id AS unit_id, u.key AS unit_key, u.symbol AS unit_symbol,
           ut.key AS unit_type_key, u.scale_to_base, u.offset_to_base
    FROM event_types et
    LEFT JOIN units default_unit ON default_unit.id = et.default_unit_id
    LEFT JOIN units u ON u.id = CASE
      WHEN $2::text IS NULL THEN default_unit.id
      ELSE (SELECT candidate.id FROM units candidate WHERE candidate.key = $2 AND candidate.unit_type_id = et.unit_type_id LIMIT 1)
    END
    LEFT JOIN unit_types ut ON ut.id = et.unit_type_id
    WHERE et.key = $1
  `, [eventTypeKey, displayUnitKey ?? null]);
  const row = result.rows[0];
  if (!row) throw new Error(`Unknown event type: ${eventTypeKey}`);
  if (displayUnitKey && !row.unit_id) throw new Error(`Unit ${displayUnitKey} is not valid for ${eventTypeKey}`);
  return row;
}

async function loadEvents(
  client: PoolClient,
  eventTypeId: string,
  from: Date,
  to: Date,
  rowsBefore: number,
  rowsAfter: number,
  includeOngoing: boolean,
  maxInputEvents: number,
  timeZone: string
): Promise<EventRow[]> {
  const result = await client.query<EventRow>(`
    WITH before_rows AS (
      SELECT id, started_at, ended_at, value, text_value, note, false AS in_requested_range
      FROM events
      WHERE event_type_id = $1 AND started_at < $2 AND ($6 OR ended_at IS NOT NULL)
      ORDER BY started_at DESC, id DESC LIMIT $4
    ), visible_rows AS (
      SELECT id, started_at, ended_at, value, text_value, note, true AS in_requested_range
      FROM events
      WHERE event_type_id = $1 AND started_at >= $2 AND started_at < $3 AND ($6 OR ended_at IS NOT NULL)
      ORDER BY started_at ASC, id ASC LIMIT $7
    ), after_rows AS (
      SELECT id, started_at, ended_at, value, text_value, note, false AS in_requested_range
      FROM events
      WHERE event_type_id = $1 AND started_at >= $3 AND ($6 OR ended_at IS NOT NULL)
      ORDER BY started_at ASC, id ASC LIMIT $5
    )
    SELECT combined.*,
      (date_trunc('day', combined.started_at AT TIME ZONE $8::text) AT TIME ZONE $8::text) AS day_bucket_start,
      (date_trunc('week', combined.started_at AT TIME ZONE $8::text) AT TIME ZONE $8::text) AS week_bucket_start
    FROM (
      SELECT * FROM before_rows
      UNION ALL SELECT * FROM visible_rows
      UNION ALL SELECT * FROM after_rows
    ) combined
    ORDER BY started_at ASC, id ASC
  `, [eventTypeId, from, to, rowsBefore, rowsAfter, includeOngoing, maxInputEvents + 1, timeZone]);
  const visibleCount = result.rows.filter((row: EventRow) => row.in_requested_range).length;
  if (visibleCount > maxInputEvents) throw new Error(`Analysis input exceeds ${maxInputEvents} visible events`);
  return result.rows;
}

export async function queryAnalysisInputs(
  db: DatabasePool,
  request: AnalysisQueryRequestV1,
  limits: AnalysisLimits
): Promise<AnalysisQueryResponseV1> {
  const client = await db.connect();
  const from = new Date(request.from);
  const to = new Date(request.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new Error('Analysis range is invalid');
  const now = new Date();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const inputs: AnalysisQueryResponseV1['inputs'] = {};
    let totalEvents = 0;
    for (const input of request.inputs) {
      const metadata = await resolveInput(client, input.eventTypeKey, input.displayUnitKey);
      const rows = await loadEvents(client, metadata.event_type_id, from, to, input.rowsBefore ?? 0, input.rowsAfter ?? 0, input.includeOngoing ?? true, limits.maxInputEvents, request.timeZone);
      totalEvents += rows.length;
      if (totalEvents > limits.maxInputEvents) throw new Error(`Combined analysis input exceeds ${limits.maxInputEvents} events`);
      const conversion = metadata.unit_id ? { scaleToBase: Number(metadata.scale_to_base), offsetToBase: Number(metadata.offset_to_base) } : null;
      inputs[input.alias] = {
        key: metadata.event_type_key,
        label: metadata.event_type_name,
        unit: metadata.unit_key && metadata.unit_symbol && metadata.unit_type_key ? {
          key: metadata.unit_key,
          symbol: metadata.unit_symbol,
          dimensionKey: metadata.unit_type_key
        } : null,
        events: rows.map((row: EventRow) => ({
          id: row.id,
          startedAt: row.started_at.toISOString(),
          endedAt: row.ended_at?.toISOString() ?? null,
          displayValue: row.value === null ? null : conversion ? fromBase(row.value, conversion) : row.value,
          textValue: row.text_value,
          note: row.note,
          ongoing: row.ended_at === null,
          inRequestedRange: row.in_requested_range,
          calendarBucketStarts: { day: row.day_bucket_start.toISOString(), week: row.week_bucket_start.toISOString() }
        }))
      };
    }
    await client.query('COMMIT');
    return {
      schemaVersion: 1,
      context: { from: from.toISOString(), to: to.toISOString(), now: now.toISOString(), timeZone: request.timeZone },
      inputs
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
