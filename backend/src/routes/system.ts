import type { FastifyInstance } from 'fastify';
import type { DatabasePool } from '../db/pool.js';
import { API_VERSION, BACKEND_VERSION } from '../constants.js';

type VoiceCatalogRow = {
  key: string;
  name: string;
  description: string | null;
  voice_aliases: string[] | null;
  unit_type_key: string | null;
  unit_type_name: string | null;
  default_unit_key: string | null;
  default_unit_name: string | null;
  default_unit_symbol: string | null;
  units: Array<{
    key: string;
    name: string;
    symbol: string;
    aliases: string[];
    isBase: boolean;
  }>;
};

export async function registerSystemRoutes(app: FastifyInstance, db: DatabasePool): Promise<void> {
  app.get('/capabilities', async () => ({
    apiVersion: API_VERSION,
    backendVersion: BACKEND_VERSION,
    features: {
      idempotency: true,
      voiceCatalog: true,
      voiceAliases: true,
      finishValue: true,
      latestStartUpdate: true,
      latestMultiFieldUpdate: true,
      eventPatch: true,
      calendarAlignedBuckets: true
    },
    idempotency: {
      header: 'Idempotency-Key',
      appliesTo: ['POST', 'PATCH', 'DELETE'],
      retentionHours: 24
    }
  }));

  app.get('/voice-catalog', async () => {
    const result = await db.query<VoiceCatalogRow>(`
      SELECT
        t.key,
        t.name,
        t.description,
        t.voice_aliases,
        ut.key AS unit_type_key,
        ut.name AS unit_type_name,
        du.key AS default_unit_key,
        du.name AS default_unit_name,
        du.symbol AS default_unit_symbol,
        COALESCE(catalog.units, '[]'::json) AS units
      FROM event_types t
      LEFT JOIN unit_types ut ON ut.id = t.unit_type_id
      LEFT JOIN units du ON du.id = t.default_unit_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'key', u.key,
            'name', u.name,
            'symbol', u.symbol,
            'aliases', u.aliases,
            'isBase', u.is_base
          ) ORDER BY u.is_base DESC, u.name
        ) AS units
        FROM units u
        WHERE u.unit_type_id = t.unit_type_id
      ) catalog ON true
      WHERE t.is_active
      ORDER BY t.name, t.key
    `);

    return {
      apiVersion: API_VERSION,
      generatedAt: new Date().toISOString(),
      eventTypes: result.rows.map((row: VoiceCatalogRow) => ({
        key: row.key,
        name: row.name,
        description: row.description,
        voiceAliases: row.voice_aliases ?? [],
        unitType: row.unit_type_key ? {
          key: row.unit_type_key,
          name: row.unit_type_name
        } : null,
        defaultUnit: row.default_unit_key ? {
          key: row.default_unit_key,
          name: row.default_unit_name,
          symbol: row.default_unit_symbol
        } : null,
        units: row.units ?? []
      }))
    };
  });
}
