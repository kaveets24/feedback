import type { FastifyRequest } from 'fastify';
import type { LoggerOptions } from 'pino';
import { scrubUrl } from '@feedback/shared/monitoring';
import type { Env } from './env.ts';

// Never log tokens, signed URLs, or share-link tokens (CLAUDE.md section 10). Fastify's default
// request serializer logs the full URL, so ours drops the query string and fragment. The redact
// paths cover anything that logs raw headers.
const redact = ['req.headers.authorization', 'req.headers.cookie'];

/** What a request log line records about the request. */
export function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: scrubUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

export function loggerOptions(env: Env): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact,
    serializers: { req: serializeRequest },
    ...(env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  };
}
