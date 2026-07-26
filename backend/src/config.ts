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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ANALYSIS_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
  ANALYSIS_MEMORY_LIMIT_BYTES: z.coerce.number().int().min(8 * 1024 * 1024).max(256 * 1024 * 1024).default(64 * 1024 * 1024),
  ANALYSIS_STACK_LIMIT_BYTES: z.coerce.number().int().min(256 * 1024).max(8 * 1024 * 1024).default(1024 * 1024),
  ANALYSIS_MAX_INPUT_EVENTS: z.coerce.number().int().min(1).max(100_000).default(25_000),
  ANALYSIS_MAX_OUTPUT_POINTS: z.coerce.number().int().min(1).max(100_000).default(25_000),
  ANALYSIS_MAX_OUTPUT_SERIES: z.coerce.number().int().min(1).max(64).default(12),
  ANALYSIS_MAX_CONSOLE_ENTRIES: z.coerce.number().int().min(0).max(1_000).default(100),
  ANALYSIS_MAX_SERIALIZED_RESULT_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(5 * 1024 * 1024),
  ANALYSIS_WORKER_POOL_SIZE: z.coerce.number().int().min(1).max(8).default(2)
});

export type AnalysisLimits = {
  executionTimeoutMs: number;
  memoryLimitBytes: number;
  stackLimitBytes: number;
  maxInputEvents: number;
  maxOutputPoints: number;
  maxOutputSeries: number;
  maxConsoleEntries: number;
  maxSerializedResultBytes: number;
  workerPoolSize: number;
};

export type AppConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  apiKey: string;
  corsOrigins: string[];
  logLevel: string;
  nodeEnv: 'development' | 'test' | 'production';
  analysis: AnalysisLimits;
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
    nodeEnv: parsed.NODE_ENV,
    analysis: {
      executionTimeoutMs: parsed.ANALYSIS_EXECUTION_TIMEOUT_MS,
      memoryLimitBytes: parsed.ANALYSIS_MEMORY_LIMIT_BYTES,
      stackLimitBytes: parsed.ANALYSIS_STACK_LIMIT_BYTES,
      maxInputEvents: parsed.ANALYSIS_MAX_INPUT_EVENTS,
      maxOutputPoints: parsed.ANALYSIS_MAX_OUTPUT_POINTS,
      maxOutputSeries: parsed.ANALYSIS_MAX_OUTPUT_SERIES,
      maxConsoleEntries: parsed.ANALYSIS_MAX_CONSOLE_ENTRIES,
      maxSerializedResultBytes: parsed.ANALYSIS_MAX_SERIALIZED_RESULT_BYTES,
      workerPoolSize: parsed.ANALYSIS_WORKER_POOL_SIZE
    }
  };
}
