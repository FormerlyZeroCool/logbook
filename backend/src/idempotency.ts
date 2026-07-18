import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabasePool } from './db/pool.js';

const writeMethods = new Set(['POST', 'PATCH', 'DELETE']);

type IdempotencyRecord = {
  request_method: string;
  request_path: string;
  request_hash: string;
  status_code: number | null;
  response_body: unknown;
  completed_at: Date | null;
  created_at: Date;
};

type RequestContext = { key: string; owner: boolean };
const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key: string) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function createRequestFingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(stableStringify({ method: method.toUpperCase(), path, body: body ?? null }))
    .digest('hex');
}

function getIdempotencyKey(request: FastifyRequest): string | null {
  const supplied = request.headers['idempotency-key'];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function responseForStorage(payload: unknown): unknown {
  if (payload === undefined || payload === null || payload === '') return null;
  if (Buffer.isBuffer(payload)) return responseForStorage(payload.toString('utf8'));
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return { raw: payload }; }
  }
  return payload;
}

export function registerIdempotencyHooks(app: FastifyInstance, db: DatabasePool): void {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!writeMethods.has(request.method)) return;
    const key = getIdempotencyKey(request);
    if (!key) return;
    if (key.length > 200) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Idempotency-Key must be between 1 and 200 characters'
      });
    }

    const fingerprint = createRequestFingerprint(request.method, request.url, request.body);

    // Expired rows must be removed before an old key can be safely reused.
    await db.query(`DELETE FROM idempotency_requests WHERE expires_at < now()`);

    const inserted = await db.query<{ key: string }>(`
      INSERT INTO idempotency_requests(
        key, request_method, request_path, request_hash
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING key
    `, [key, request.method, request.url, fingerprint]);

    if (inserted.rowCount) {
      requestContexts.set(request, { key, owner: true });
      return;
    }

    const existingResult = await db.query<IdempotencyRecord>(`
      SELECT request_method, request_path, request_hash, status_code,
             response_body, completed_at, created_at
      FROM idempotency_requests
      WHERE key = $1
    `, [key]);
    const existing = existingResult.rows[0];
    if (!existing) {
      return reply.code(409).send({ error: 'idempotency_conflict', message: 'Idempotency state changed; retry the request' });
    }
    if (existing.request_hash !== fingerprint) {
      return reply.code(409).send({
        error: 'idempotency_conflict',
        message: 'The same Idempotency-Key was already used for a different request'
      });
    }
    if (existing.completed_at && existing.status_code !== null) {
      reply.header('Idempotency-Replayed', 'true');
      return reply.code(existing.status_code).send(existing.response_body ?? undefined);
    }

    const reclaimed = await db.query<{ key: string }>(`
      UPDATE idempotency_requests
      SET created_at = now(), expires_at = now() + interval '24 hours'
      WHERE key = $1
        AND completed_at IS NULL
        AND created_at < now() - interval '5 minutes'
      RETURNING key
    `, [key]);
    if (reclaimed.rowCount) {
      requestContexts.set(request, { key, owner: true });
      return;
    }

    return reply.code(409).send({
      error: 'idempotency_in_progress',
      message: 'A request with this Idempotency-Key is still in progress'
    });
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const context = requestContexts.get(request);
    if (!context?.owner) return payload;
    await db.query(`
      UPDATE idempotency_requests
      SET status_code = $2,
          response_body = $3::jsonb,
          completed_at = now(),
          expires_at = now() + interval '24 hours'
      WHERE key = $1
    `, [context.key, reply.statusCode, JSON.stringify(responseForStorage(payload))]);
    return payload;
  });
}
