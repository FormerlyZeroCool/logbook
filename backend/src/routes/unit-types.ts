import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabasePool } from '../db/pool.js';
import { hasPostgreSqlErrorCode } from '../db/errors.js';
import { serializeUnit, type UnitRow, type UnitTypeRow } from '../serializers.js';
import {
  unitCreateSchema,
  unitKeySchema,
  unitTypeCreateSchema,
  unitTypeKeySchema,
  unitTypeUpdateSchema,
  unitUpdateSchema
} from '../validation.js';

export type UnitUsageRow = UnitRow & {
  event_count: number;
  default_event_type_count: number;
};

type UnitTypeUsageRow = UnitTypeRow & {
  event_type_count: number;
};

type ManagedUnit = ReturnType<typeof serializeManagedUnit>;

type ManagedUnitType = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  baseUnit: ManagedUnit | null;
  units: ManagedUnit[];
  eventTypeCount: number;
  createdAt: string;
  updatedAt: string;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeManagedUnit(row: UnitUsageRow): ReturnType<typeof serializeUnit> & { eventCount: number; defaultEventTypeCount: number } {
  return {
    ...serializeUnit(row),
    eventCount: Number(row.event_count ?? 0),
    defaultEventTypeCount: Number(row.default_event_type_count ?? 0)
  };
}

function serializeUnitType(row: UnitTypeUsageRow, units: UnitUsageRow[]): ManagedUnitType {
  const serializedUnits = units.map(serializeManagedUnit);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    baseUnit: serializedUnits.find((unit: ManagedUnit) => unit.isBase) ?? null,
    units: serializedUnits,
    eventTypeCount: Number(row.event_type_count ?? 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

async function getUnitTypeRows(db: DatabasePool, key?: string): Promise<ManagedUnitType[]> {
  const typeResult = await db.query<UnitTypeRow>(`
    SELECT *
    FROM unit_types
    ${key ? 'WHERE key = $1' : ''}
    ORDER BY name
  `, key ? [key] : []);

  return Promise.all(typeResult.rows.map(async (type: UnitTypeRow) => {
    const [unitResult, eventTypeCount] = await Promise.all([
      db.query<UnitRow>(`
        SELECT
          id,
          unit_type_id,
          key,
          name,
          symbol,
          scale_to_base::double precision AS scale_to_base,
          offset_to_base::double precision AS offset_to_base,
          aliases,
          is_base,
          created_at,
          updated_at
        FROM units
        WHERE unit_type_id = $1
        ORDER BY is_base DESC, name
      `, [type.id]),
      db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM event_types WHERE unit_type_id = $1', [type.id])
    ]);

    const units = await Promise.all(unitResult.rows.map(async (unit: UnitRow) => {
      const [eventCount, defaultCount] = await Promise.all([
        db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM events WHERE input_unit_id = $1', [unit.id]),
        db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM event_types WHERE default_unit_id = $1', [unit.id])
      ]);
      return {
        ...unit,
        event_count: Number(eventCount.rows[0]?.count ?? 0),
        default_event_type_count: Number(defaultCount.rows[0]?.count ?? 0)
      };
    }));

    return serializeUnitType(
      { ...type, event_type_count: Number(eventTypeCount.rows[0]?.count ?? 0) },
      units
    );
  }));
}

async function getUnitType(db: DatabasePool, key: string): Promise<ManagedUnitType | null> {
  return (await getUnitTypeRows(db, key))[0] ?? null;
}

export async function registerUnitTypeRoutes(app: FastifyInstance, db: DatabasePool): Promise<void> {
  app.get('/unit-types', async () => ({ unitTypes: await getUnitTypeRows(db) }));

  app.get('/unit-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = unitTypeKeySchema.parse((request.params as { key: string }).key);
    const unitType = await getUnitType(db, key);
    if (!unitType) return reply.code(404).send({ error: 'not_found', message: `Unknown unit type: ${key}` });
    return unitType;
  });

  app.post('/unit-types', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = unitTypeCreateSchema.parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const typeResult = await client.query<{ id: string }>(`
        INSERT INTO unit_types(key, name, description)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [body.key, body.name, body.description ?? null]);
      await client.query(`
        INSERT INTO units(
          unit_type_id, key, name, symbol, scale_to_base, offset_to_base, aliases, is_base
        ) VALUES ($1, $2, $3, $4, 1, 0, $5, true)
      `, [typeResult.rows[0]!.id, body.baseUnit.key, body.baseUnit.name, body.baseUnit.symbol, body.baseUnit.aliases ?? []]);
      await client.query('COMMIT');
      return reply.code(201).send(await getUnitType(db, body.key));
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if (hasPostgreSqlErrorCode(error, '23505')) {
        return reply.code(409).send({ error: 'conflict', message: `Unit type or base unit key already exists: ${body.key}` });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch('/unit-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = unitTypeKeySchema.parse((request.params as { key: string }).key);
    const body = unitTypeUpdateSchema.parse(request.body);
    const result = await db.query(`
      UPDATE unit_types
      SET name = COALESCE($2, name),
          description = CASE WHEN $3::boolean THEN $4 ELSE description END
      WHERE key = $1
      RETURNING id
    `, [key, body.name ?? null, body.description !== undefined, body.description ?? null]);
    if (!result.rowCount) return reply.code(404).send({ error: 'not_found', message: `Unknown unit type: ${key}` });
    return await getUnitType(db, key);
  });

  app.delete('/unit-types/:key', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = unitTypeKeySchema.parse((request.params as { key: string }).key);
    const unitType = await getUnitType(db, key);
    if (!unitType) return reply.code(404).send({ error: 'not_found', message: `Unknown unit type: ${key}` });
    if (unitType.eventTypeCount > 0) {
      return reply.code(409).send({ error: 'conflict', message: 'Unit types used by event types cannot be deleted' });
    }
    if (unitType.units.some((unit: ManagedUnit) => unit.eventCount > 0)) {
      return reply.code(409).send({ error: 'conflict', message: 'Unit types with recorded event inputs cannot be deleted' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM units WHERE unit_type_id = $1', [unitType.id]);
      await client.query('DELETE FROM unit_types WHERE id = $1', [unitType.id]);
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if (hasPostgreSqlErrorCode(error, '23503')) {
        return reply.code(409).send({ error: 'conflict', message: 'The unit type is referenced and cannot be deleted' });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/unit-types/:key/units', async (request: FastifyRequest, reply: FastifyReply) => {
    const typeKey = unitTypeKeySchema.parse((request.params as { key: string }).key);
    const body = unitCreateSchema.parse(request.body);
    try {
      const result = await db.query<{ id: string }>(`
        INSERT INTO units(
          unit_type_id, key, name, symbol, scale_to_base, offset_to_base, aliases, is_base
        )
        SELECT id, $2, $3, $4, $5::numeric, $6::numeric, $7::text[], false
        FROM unit_types
        WHERE key = $1
        RETURNING id
      `, [typeKey, body.key, body.name, body.symbol, body.scaleToBase, body.offsetToBase, body.aliases ?? []]);
      if (!result.rowCount) return reply.code(404).send({ error: 'not_found', message: `Unknown unit type: ${typeKey}` });
      return reply.code(201).send(await getUnitType(db, typeKey));
    } catch (error: unknown) {
      if (hasPostgreSqlErrorCode(error, '23505')) {
        return reply.code(409).send({ error: 'conflict', message: `Unit ${body.key} already exists in ${typeKey}` });
      }
      throw error;
    }
  });

  app.patch('/unit-types/:key/units/:unitKey', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { key: string; unitKey: string };
    const typeKey = unitTypeKeySchema.parse(params.key);
    const unitKey = unitKeySchema.parse(params.unitKey);
    const body = unitUpdateSchema.parse(request.body);

    const current = await db.query<{ id: string; is_base: boolean }>(`
      SELECT u.id, u.is_base
      FROM units u
      JOIN unit_types ut ON ut.id = u.unit_type_id
      WHERE ut.key = $1 AND u.key = $2
    `, [typeKey, unitKey]);
    if (!current.rowCount) return reply.code(404).send({ error: 'not_found', message: `Unknown unit: ${typeKey}/${unitKey}` });

    const row = current.rows[0]!;
    const eventCountResult = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM events WHERE input_unit_id = $1',
      [row.id]
    );
    const eventCount = Number(eventCountResult.rows[0]?.count ?? 0);
    const changesConversion = body.scaleToBase !== undefined || body.offsetToBase !== undefined;
    if (row.is_base && changesConversion) {
      return reply.code(409).send({ error: 'conflict', message: 'A base unit must keep scaleToBase=1 and offsetToBase=0' });
    }
    if (changesConversion && eventCount > 0) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'Conversion cannot change after the unit has been used. Create a new unit key instead.'
      });
    }

    await db.query(`
      UPDATE units
      SET name = COALESCE($3, name),
          symbol = COALESCE($4, symbol),
          scale_to_base = COALESCE($5::numeric, scale_to_base),
          offset_to_base = COALESCE($6::numeric, offset_to_base),
          aliases = COALESCE($7::text[], aliases)
      WHERE id = $1 AND key = $2
    `, [row.id, unitKey, body.name ?? null, body.symbol ?? null, body.scaleToBase ?? null, body.offsetToBase ?? null, body.aliases ?? null]);
    return await getUnitType(db, typeKey);
  });

  app.delete('/unit-types/:key/units/:unitKey', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { key: string; unitKey: string };
    const typeKey = unitTypeKeySchema.parse(params.key);
    const unitKey = unitKeySchema.parse(params.unitKey);
    const result = await db.query<{ id: string; is_base: boolean }>(`
      SELECT u.id, u.is_base
      FROM units u
      JOIN unit_types ut ON ut.id = u.unit_type_id
      WHERE ut.key = $1 AND u.key = $2
    `, [typeKey, unitKey]);
    if (!result.rowCount) return reply.code(404).send({ error: 'not_found', message: `Unknown unit: ${typeKey}/${unitKey}` });
    if (result.rows[0]!.is_base) {
      return reply.code(409).send({ error: 'conflict', message: 'The base unit cannot be deleted' });
    }
    try {
      await db.query('DELETE FROM units WHERE id = $1', [result.rows[0]!.id]);
      return reply.code(204).send();
    } catch (error: unknown) {
      if (hasPostgreSqlErrorCode(error, '23503')) {
        return reply.code(409).send({ error: 'conflict', message: 'This unit is referenced by events or event types and cannot be deleted' });
      }
      throw error;
    }
  });
}
