import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { DataType, newDb } from 'pg-mem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { DatabasePool } from './db/pool.js';
import { registerUnitTypeRoutes } from './routes/unit-types.js';

let pool: DatabasePool;
let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true
  });
  memory.public.none(`
    CREATE TABLE unit_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      scale_to_base NUMERIC NOT NULL,
      offset_to_base NUMERIC NOT NULL DEFAULT 0,
      aliases TEXT[] NOT NULL DEFAULT '{}',
      is_base BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(unit_type_id, key)
    );
    CREATE TABLE event_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_type_id UUID REFERENCES unit_types(id),
      default_unit_id UUID REFERENCES units(id)
    );
    CREATE TABLE events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      input_unit_id UUID REFERENCES units(id)
    );
  `);
  const adapter = memory.adapters.createPg();
  pool = new adapter.Pool() as unknown as DatabasePool;
  app = Fastify();
  await registerUnitTypeRoutes(app, pool);
  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'validation_error', issues: error.issues });
    return reply.send(error);
  });
});

afterEach(async () => {
  await app.close();
  await pool.end();
});

describe('unit catalog with pg-mem', () => {
  it('creates a unit type with an identity base unit and adds a converted unit', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/unit-types',
      payload: {
        key: 'distance',
        name: 'Distance',
        baseUnit: { key: 'm', name: 'Meter', symbol: 'm' }
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().baseUnit).toMatchObject({ key: 'm', scaleToBase: 1, offsetToBase: 0, isBase: true });

    const added = await app.inject({
      method: 'POST',
      url: '/unit-types/distance/units',
      payload: {
        key: 'km',
        name: 'Kilometer',
        symbol: 'km',
        scaleToBase: 1000,
        offsetToBase: 0,
        aliases: ['kilometer', 'kilometers']
      }
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().units).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'km', scaleToBase: 1000 })
    ]));
  });

  it('requires conversion data when adding a non-base unit', async () => {
    await app.inject({
      method: 'POST',
      url: '/unit-types',
      payload: { key: 'distance', name: 'Distance', baseUnit: { key: 'm', name: 'Meter', symbol: 'm' } }
    });
    const response = await app.inject({
      method: 'POST',
      url: '/unit-types/distance/units',
      payload: { key: 'km', name: 'Kilometer', symbol: 'km' }
    });
    expect(response.statusCode).toBe(400);
  });


  it('updates an unused conversion but locks it after the unit is used', async () => {
    await app.inject({
      method: 'POST', url: '/unit-types',
      payload: { key: 'distance', name: 'Distance', baseUnit: { key: 'm', name: 'Meter', symbol: 'm' } }
    });
    const addResponse = await app.inject({
      method: 'POST', url: '/unit-types/distance/units',
      payload: { key: 'km', name: 'Kilometer', symbol: 'km', scaleToBase: 1000 }
    });
    expect(addResponse.statusCode).toBe(201);

    const updated = await app.inject({
      method: 'PATCH', url: '/unit-types/distance/units/km',
      payload: { scaleToBase: 1000.5 }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().units).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'km', scaleToBase: 1000.5 })
    ]));

    const unit = await pool.query<{ id: string }>("SELECT id FROM units WHERE key = 'km'");
    await pool.query('INSERT INTO events(input_unit_id) VALUES ($1)', [unit.rows[0]!.id]);
    const locked = await app.inject({
      method: 'PATCH', url: '/unit-types/distance/units/km',
      payload: { scaleToBase: 999 }
    });
    expect(locked.statusCode).toBe(409);
  });

  it('does not allow deleting the base unit', async () => {
    await app.inject({
      method: 'POST',
      url: '/unit-types',
      payload: { key: 'distance', name: 'Distance', baseUnit: { key: 'm', name: 'Meter', symbol: 'm' } }
    });
    const response = await app.inject({ method: 'DELETE', url: '/unit-types/distance/units/m' });
    expect(response.statusCode).toBe(409);
  });
});
