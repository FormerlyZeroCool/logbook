import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { createPool, type DatabasePool } from './db/pool.js';
import { createApiKeyHook } from './auth.js';
import { registerEventTypeRoutes } from './routes/event-types.js';
import { registerEventRoutes } from './routes/events.js';
import { registerSeriesRoutes } from './routes/series.js';
import { registerUnitTypeRoutes } from './routes/unit-types.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerIdempotencyHooks } from './idempotency.js';
import { API_VERSION, BACKEND_VERSION } from './constants.js';

export async function buildApp(config: AppConfig, database?: DatabasePool) {
  const logger = config.nodeEnv === 'development'
    ? {
        level: config.logLevel,
        transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } }
      }
    : { level: config.logLevel };

  const app = Fastify({ logger });
  const db = database ?? createPool(config);

  await app.register(cors, {
    origin: config.corsOrigins.length === 0
      ? false
      : (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
          if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
          else callback(new Error('Origin is not allowed'), false);
        }
  });

  app.get('/health', async () => {
    const result = await db.query<{
      now: Date;
      postgres_version: string;
      timescale_version: string;
    }>(
      `SELECT
         now(),
         current_setting('server_version') AS postgres_version,
         extversion AS timescale_version
       FROM pg_extension
       WHERE extname = 'timescaledb'`
    );
    return {
      status: 'ok',
      databaseTime: result.rows[0]?.now.toISOString() ?? null,
      postgresVersion: result.rows[0]?.postgres_version ?? null,
      timescaleVersion: result.rows[0]?.timescale_version ?? null,
      apiVersion: API_VERSION,
      backendVersion: BACKEND_VERSION
    };
  });

  await app.register(async (api: FastifyInstance) => {
    api.addHook('onRequest', createApiKeyHook(config.apiKey));
    registerIdempotencyHooks(api, db);
    await registerSystemRoutes(api, db);
    await registerUnitTypeRoutes(api, db);
    await registerEventTypeRoutes(api, db);
    await registerEventRoutes(api, db);
    await registerSeriesRoutes(api, db);
  }, { prefix: '/api/v1' });

  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Request validation failed',
        issues: error.issues
      });
    }
    if (error instanceof Error && [
      'endedAt must be at or after startedAt',
      'Use only one of eventTypeId or eventTypeKey',
      'Point events must have an end time equal to their start time',
      'Point events must have identical start and end times'
    ].includes(error.message)) {
      return reply.code(400).send({ error: 'validation_error', message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal_error', message: 'An unexpected error occurred' });
  });

  app.addHook('onClose', async () => {
    await db.end();
  });

  return app;
}
