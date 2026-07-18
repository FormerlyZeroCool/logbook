import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createApiKeyHook(apiKey: string) {
  return async function apiKeyHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : request.headers['x-api-key'];

    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!candidate || !constantTimeEqual(candidate, apiKey)) {
      await reply.code(401).send({ error: 'unauthorized', message: 'A valid bearer API key is required' });
    }
  };
}
