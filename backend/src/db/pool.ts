import pg from 'pg';
import type { AppConfig } from '../config.js';

const { Pool } = pg;

export type DatabasePool = pg.Pool;

export function createPool(config: AppConfig): DatabasePool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'ha-timeseries-logbook'
  });
}
