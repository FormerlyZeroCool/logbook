import Fastify, { type FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerSystemRoutes } from './routes/system.js';

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

async function buildTestApp(): Promise<FastifyInstance> {
  const db = {
    query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
      if (sql.includes('t.voice_aliases') && sql.includes('catalog.units')) {
        return queryResult([{
          key: 'feeding_jay',
          name: 'Feeding Jay',
          description: 'Bottle and nursing feedings',
          voice_aliases: ['feed Jay', 'Jay feeding'],
          unit_type_key: 'volume',
          unit_type_name: 'Volume',
          default_unit_key: 'fl_oz_us',
          default_unit_name: 'US fluid ounce',
          default_unit_symbol: 'fl oz',
          units: [
            { key: 'ml', name: 'Milliliter', symbol: 'mL', aliases: [], isBase: true },
            { key: 'fl_oz_us', name: 'US fluid ounce', symbol: 'fl oz', aliases: ['ounce'], isBase: false }
          ]
        }] as unknown as Row[]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined
  } as unknown as DatabasePool;

  const app = Fastify();
  await registerSystemRoutes(app, db);
  return app;
}

describe('system routes', () => {
  it('advertises integration reliability capabilities', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/capabilities' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      apiVersion: '1',
      backendVersion: '0.11.0',
      features: {
        idempotency: true,
        voiceCatalog: true,
        voiceAliases: true,
        latestMultiFieldUpdate: true
      }
    });
    await app.close();
  });

  it('returns active event types with compatible units and aliases', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/voice-catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      apiVersion: '1',
      eventTypes: [{
        key: 'feeding_jay',
        voiceAliases: ['feed Jay', 'Jay feeding'],
        unitType: { key: 'volume' },
        defaultUnit: { key: 'fl_oz_us', symbol: 'fl oz' },
        units: [{ key: 'ml' }, { key: 'fl_oz_us' }]
      }]
    });
    await app.close();
  });
});
