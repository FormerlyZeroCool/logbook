import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

export type AppConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  apiKey: string;
  corsOrigins: string[];
  logLevel: string;
  nodeEnv: 'development' | 'test' | 'production';
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    apiKey: parsed.API_KEY,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((value: string) => value.trim()).filter(Boolean),
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV
  };
}
