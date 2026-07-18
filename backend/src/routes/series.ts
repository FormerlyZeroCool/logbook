import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabasePool } from '../db/pool.js';
import { eventTypeKeySchema, seriesQuerySchema } from '../validation.js';
import { fromBase } from '../unit-conversion.js';


type AggregateSeriesRow = {
  bucket: Date;
  event_count: number;
  value_avg: number | null;
  value_min: number | null;
  value_max: number | null;
  value_sum: number | null;
  duration_avg_seconds: number | null;
  duration_min_seconds: number | null;
  duration_max_seconds: number | null;
  duration_sum_seconds: number | null;
};

type RawSeriesRow = {
  id: string;
  event_kind: 'point' | 'duration';
  started_at: Date;
  ended_at: Date | null;
  value: number | null;
  text_value: string | null;
  note: string | null;
  duration_seconds: number;
  ongoing: boolean;
};

function defaultFrom(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function unit(row: Record<string, unknown>, prefix: string) {
  const id = row[`${prefix}_unit_id`] as string | null;
  if (!id) return null;
  return {
    id,
    key: row[`${prefix}_unit_key`] as string,
    name: row[`${prefix}_unit_name`] as string,
    symbol: row[`${prefix}_unit_symbol`] as string,
    scaleToBase: Number(row[`${prefix}_unit_scale_to_base`]),
    offsetToBase: Number(row[`${prefix}_unit_offset_to_base`]),
    isBase: prefix === 'base'
  };
}

export async function registerSeriesRoutes(app: FastifyInstance, db: DatabasePool): Promise<void> {
  app.get('/event-types/:key/series', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = eventTypeKeySchema.parse((request.params as { key: string }).key);
    const query = seriesQuerySchema.parse(request.query);
    const from = query.from ?? defaultFrom();
    const to = query.to ?? new Date().toISOString();

    if (Date.parse(to) < Date.parse(from)) {
      return reply.code(400).send({ error: 'bad_request', message: '`to` must be after `from`' });
    }

    const typeResult = await db.query<{
      key: string;
      name: string;
      unit_type_id: string | null;
      unit_type_key: string | null;
      unit_type_name: string | null;
      base_unit_id: string | null;
      base_unit_key: string | null;
      base_unit_name: string | null;
      base_unit_symbol: string | null;
      base_unit_scale_to_base: number | null;
      base_unit_offset_to_base: number | null;
      default_unit_id: string | null;
      default_unit_key: string | null;
      default_unit_name: string | null;
      default_unit_symbol: string | null;
      default_unit_scale_to_base: number | null;
      default_unit_offset_to_base: number | null;
    }>(`
      SELECT
        t.key,
        t.name,
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
        du.offset_to_base::double precision AS default_unit_offset_to_base
      FROM event_types t
      LEFT JOIN unit_types ut ON ut.id = t.unit_type_id
      LEFT JOIN units bu ON bu.unit_type_id = t.unit_type_id AND bu.is_base
      LEFT JOIN units du ON du.id = t.default_unit_id
      WHERE t.key = $1
    `, [key]);
    if (!typeResult.rowCount) {
      return reply.code(404).send({ error: 'not_found', message: `Unknown event type: ${key}` });
    }

    const eventType = typeResult.rows[0]!;
    let displayUnit = unit(eventType as unknown as Record<string, unknown>, 'default');
    if (query.displayUnitKey) {
      if (!eventType.unit_type_id) {
        return reply.code(400).send({ error: 'validation_error', message: 'Unitless series cannot select a display unit' });
      }
      const displayResult = await db.query<{
        id: string; key: string; name: string; symbol: string; scale_to_base: number; offset_to_base: number;
      }>(`
        SELECT id, key, name, symbol,
          scale_to_base::double precision AS scale_to_base,
          offset_to_base::double precision AS offset_to_base
        FROM units
        WHERE unit_type_id = $1 AND key = $2
      `, [eventType.unit_type_id, query.displayUnitKey]);
      if (!displayResult.rowCount) {
        return reply.code(400).send({ error: 'validation_error', message: `Unknown display unit ${query.displayUnitKey} for this series` });
      }
      const selected = displayResult.rows[0]!;
      displayUnit = {
        id: selected.id,
        key: selected.key,
        name: selected.name,
        symbol: selected.symbol,
        scaleToBase: Number(selected.scale_to_base),
        offsetToBase: Number(selected.offset_to_base),
        isBase: false
      };
    }

    const convert = (value: number | null): number | null => value === null || !displayUnit
      ? value
      : fromBase(Number(value), displayUnit);
    const convertSum = (value: number | null, count: number): number | null => value === null || !displayUnit
      ? value
      : (Number(value) - (displayUnit.offsetToBase * count)) / displayUnit.scaleToBase;

    // Day/week buckets are calendar concepts, not fixed UTC intervals. Bucket the
    // event's local wall-clock timestamp first, then reinterpret the local bucket
    // boundary in the requested IANA zone. This makes an EDT day start serialize
    // as 04:00Z (local midnight), rather than 00:00Z (8:00 PM the previous day).
    // Shorter fixed-duration buckets stay UTC-aligned.
    const calendarAlignedBucket = /\s(day|days|week|weeks)$/.test(query.bucket);
    const bucketExpression = calendarAlignedBucket
      ? 'timezone($5::text, time_bucket($4::interval, timezone($5::text, e.started_at)))'
      : 'time_bucket($4::interval, e.started_at)';

    const aggregateParams = calendarAlignedBucket
      ? [key, from, to, query.bucket, query.timeZone]
      : [key, from, to, query.bucket];

    const aggregateResult = await db.query<AggregateSeriesRow>(`
      SELECT
        ${bucketExpression} AS bucket,
        COUNT(*)::int AS event_count,
        AVG(e.value) FILTER (WHERE e.value IS NOT NULL) AS value_avg,
        MIN(e.value) FILTER (WHERE e.value IS NOT NULL) AS value_min,
        MAX(e.value) FILTER (WHERE e.value IS NOT NULL) AS value_max,
        SUM(e.value) FILTER (WHERE e.value IS NOT NULL) AS value_sum,
        AVG(e.duration_seconds) FILTER (WHERE e.duration_seconds IS NOT NULL) AS duration_avg_seconds,
        MIN(e.duration_seconds) FILTER (WHERE e.duration_seconds IS NOT NULL) AS duration_min_seconds,
        MAX(e.duration_seconds) FILTER (WHERE e.duration_seconds IS NOT NULL) AS duration_max_seconds,
        SUM(e.duration_seconds) FILTER (WHERE e.duration_seconds IS NOT NULL) AS duration_sum_seconds
      FROM events e
      JOIN event_types t ON t.id = e.event_type_id
      WHERE t.key = $1
        AND e.started_at >= $2::timestamptz
        AND e.started_at <= $3::timestamptz
      GROUP BY bucket
      ORDER BY bucket ASC
    `, aggregateParams);

    const rawResult = await db.query<RawSeriesRow>(`
      SELECT
        e.id,
        e.event_kind,
        e.started_at,
        e.ended_at,
        e.value,
        e.text_value,
        e.note,
        COALESCE(
          e.duration_seconds,
          EXTRACT(EPOCH FROM (LEAST(now(), $3::timestamptz) - e.started_at))::double precision
        ) AS duration_seconds,
        (e.ended_at IS NULL) AS ongoing
      FROM events e
      JOIN event_types t ON t.id = e.event_type_id
      WHERE t.key = $1
        AND e.started_at >= $2::timestamptz
        AND e.started_at <= $3::timestamptz
      ORDER BY e.started_at ASC
      LIMIT 5000
    `, [key, from, to]);

    const baseUnit = unit(eventType as unknown as Record<string, unknown>, 'base');
    const defaultUnit = unit(eventType as unknown as Record<string, unknown>, 'default');
    return {
      eventType: {
        key: eventType.key,
        name: eventType.name,
        unitType: eventType.unit_type_id ? {
          id: eventType.unit_type_id,
          key: eventType.unit_type_key,
          name: eventType.unit_type_name
        } : null,
        baseUnit,
        defaultUnit,
        displayUnit,
        unit: displayUnit?.symbol ?? null
      },
      from,
      to,
      bucket: query.bucket,
      timeZone: query.timeZone,
      points: aggregateResult.rows.map((row: AggregateSeriesRow) => ({
        bucket: row.bucket.toISOString(),
        eventCount: row.event_count,
        valueAvg: convert(row.value_avg),
        valueMin: convert(row.value_min),
        valueMax: convert(row.value_max),
        valueSum: convertSum(row.value_sum, row.event_count),
        durationAvgSeconds: row.duration_avg_seconds,
        durationMinSeconds: row.duration_min_seconds,
        durationMaxSeconds: row.duration_max_seconds,
        durationSumSeconds: row.duration_sum_seconds
      })),
      valuePoints: rawResult.rows
        .filter((row: RawSeriesRow) => row.value !== null)
        .map((row: RawSeriesRow) => ({
          eventId: row.id,
          eventKind: row.event_kind,
          at: row.started_at.toISOString(),
          endedAt: row.ended_at?.toISOString() ?? null,
          value: convert(row.value)!,
          canonicalValue: row.value,
          textValue: row.text_value,
          note: row.note,
          durationSeconds: row.duration_seconds,
          ongoing: row.ongoing
        })),
      durationPoints: rawResult.rows.map((row: RawSeriesRow) => ({
        eventId: row.id,
        eventKind: row.event_kind,
        startedAt: row.started_at.toISOString(),
        endedAt: row.ended_at?.toISOString() ?? null,
        value: convert(row.value),
        canonicalValue: row.value,
        textValue: row.text_value,
        note: row.note,
        durationSeconds: row.duration_seconds,
        ongoing: row.ongoing
      }))
    };
  });
}
