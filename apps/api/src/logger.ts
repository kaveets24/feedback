import type { LoggerOptions } from 'pino';
import type { Env } from './env.ts';

// Never log tokens, signed URLs, or share-link tokens (CLAUDE.md section 10).
const redact = ['req.headers.authorization', 'req.headers.cookie', 'req.query.token'];

export function loggerOptions(env: Env): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact,
    ...(env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  };
}
