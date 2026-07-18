import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DatabasePool } from './db/pool.js';
import { registerIdempotencyHooks } from './idempotency.js';

type RecordRow = {
  request_method: string;
  request_path: string;
  request_hash: string;
  status_code: number | null;
  response_body: unknown;
  completed_at: Date | null;
  created_at: Date;
};

function result<Row extends QueryResultRow>(rows: Row[], command: string = 'SELECT'): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

async function buildApp(): Promise<{ app: FastifyInstance; calls: () => number }> {
  const records = new Map<string, RecordRow>();
  let calls = 0;
  const db = {
    query: async <Row extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<Row>> => {
      const key = String(params[0] ?? '');
      if (sql.includes('DELETE FROM idempotency_requests')) {
        return result([] as Row[], 'DELETE');
      }
      if (sql.includes('INSERT INTO idempotency_requests')) {
        if (records.has(key)) return result([] as Row[], 'INSERT');
        records.set(key, {
          request_method: String(params[1]),
          request_path: String(params[2]),
          request_hash: String(params[3]),
          status_code: null,
          response_body: null,
          completed_at: null,
          created_at: new Date(),
        });
        return result([{ key }] as unknown as Row[], 'INSERT');
      }
      if (sql.includes('SELECT request_method')) {
        const row = records.get(key);
        return result((row ? [row] : []) as unknown as Row[]);
      }
      if (sql.includes('AND created_at <')) {
        return result([] as Row[], 'UPDATE');
      }
      if (sql.includes('SET status_code')) {
        const row = records.get(key)!;
        row.status_code = Number(params[1]);
        row.response_body = JSON.parse(String(params[2]));
        row.completed_at = new Date();
        return result([] as Row[], 'UPDATE');
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    end: async (): Promise<void> => undefined,
  } as unknown as DatabasePool;

  const app = Fastify();
  registerIdempotencyHooks(app, db);
  app.post('/write', async (_request: FastifyRequest, reply: FastifyReply) => {
    calls += 1;
    return reply.code(201).send({ calls });
  });
  return { app, calls: () => calls };
}

describe('idempotency request hooks', () => {
  it('replays the first completed response without invoking the route twice', async () => {
    const { app, calls } = await buildApp();
    const first = await app.inject({
      method: 'POST', url: '/write', headers: { 'idempotency-key': 'tool-call-1' }, payload: { value: 3 },
    });
    const replay = await app.inject({
      method: 'POST', url: '/write', headers: { 'idempotency-key': 'tool-call-1' }, payload: { value: 3 },
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual({ calls: 1 });
    expect(calls()).toBe(1);
    await app.close();
  });

  it('rejects reuse of a key for a different body', async () => {
    const { app, calls } = await buildApp();
    await app.inject({
      method: 'POST', url: '/write', headers: { 'idempotency-key': 'tool-call-2' }, payload: { value: 3 },
    });
    const conflict = await app.inject({
      method: 'POST', url: '/write', headers: { 'idempotency-key': 'tool-call-2' }, payload: { value: 4 },
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'idempotency_conflict' });
    expect(calls()).toBe(1);
    await app.close();
  });
});
