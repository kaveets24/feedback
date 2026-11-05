import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { CLIENT_IP_HEADER, WEB_SECRET_HEADER } from '@feedback/shared';
import type { Env } from './env.ts';
import { httpError } from './errors.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * How many requests each kind of caller gets. A signed-in account is counted separately for each
 * kind, and everyone signed out by IP address, for all of them together.
 */
export const RATE_LIMITS = {
  /** Starting an upload (audio, a new version, a cover, a picture). */
  upload: { max: 30, windowMs: HOUR },
  /** Comments and replies. */
  comment: { max: 30, windowMs: MINUTE },
  /** Any other write. */
  write: { max: 60, windowMs: MINUTE },
  /** Signed-in reads. */
  read: { max: 300, windowMs: MINUTE },
  anonymous: { max: 120, windowMs: MINUTE },
} as const;

type LimitName = keyof typeof RATE_LIMITS;

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * A stricter limit for this route when signed in, or `false` for none at all (the health
     * checks, so uptime monitoring can't be throttled). Otherwise it's limited as a read or write.
     */
    limit?: 'upload' | 'comment' | false;
  }
}

/** Which limit a request falls under, or null for none. */
function limitFor(request: FastifyRequest): LimitName | null {
  const { limit } = request.routeOptions.config;
  if (limit === false) return null;
  if (request.actor.kind === 'anonymous') return 'anonymous';
  if (limit) return limit;
  return request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
}

function secretMatches(given: unknown, secret: string): boolean {
  if (typeof given !== 'string') return false;
  // Hashed so the comparison doesn't depend on, or reveal, the secret's length.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

/**
 * The address a signed-out request is counted against. The web app calls the API from its server,
 * so it passes the visitor's address along, trusted only with the shared secret. Anyone calling the
 * API directly is counted by the address Fly's proxy saw, which it sets itself, so a caller can't
 * choose it. Off Fly that header means nothing, so it's the socket's address.
 */
export function clientIp(request: FastifyRequest, env: Env): string {
  const { headers } = request;
  if (env.WEB_API_SECRET && secretMatches(headers[WEB_SECRET_HEADER], env.WEB_API_SECRET)) {
    const forwarded = headers[CLIENT_IP_HEADER];
    if (typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  }
  const fly = headers['fly-client-ip'];
  if (env.FLY_APP_NAME && typeof fly === 'string' && isIP(fly)) return fly;
  return request.ip;
}

/**
 * An address as a counter's key. Someone with IPv6 usually controls a whole /64, so that's what's
 * counted, and an IPv4 address written as IPv6 counts as itself.
 */
export function ipKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) return mapped;
  if (isIP(ip) !== 6) return ip;
  const [head = '', tail = ''] = ip.split('%')[0]!.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const zeros = Array<string>(Math.max(0, 8 - before.length - after.length)).fill('0');
  const groups = [...before, ...zeros, ...after].slice(0, 4);
  return `${groups.map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * The Redis connection for the counters, kept apart from BullMQ's: that one waits out an outage,
 * and this one must fail at once, so that a request is never held up by its limiter.
 */
export function rateLimitRedis(url: string): Redis {
  return new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 250,
  });
}

export interface RateLimitDeps {
  /** Where the counts live, shared across API machines. Without it they're per process. */
  redis?: Redis;
}

/**
 * Limits every request (CLAUDE.md section 8). It runs after auth, since accounts are counted by
 * who they are, and before the approval gate, so accounts waiting for approval are counted too. If
 * Redis is unavailable requests go through: losing the limiter shouldn't take the app down.
 *
 * Without `WEB_API_SECRET` the signed-out limit is off, since every signed-out page load would
 * look like it came from the web app's own servers and share one count.
 */
export async function registerRateLimits(
  app: FastifyInstance,
  env: Env,
  { redis }: RateLimitDeps,
): Promise<void> {
  const limit = (request: FastifyRequest) => RATE_LIMITS[limitFor(request) ?? 'read'];

  if (!env.WEB_API_SECRET && env.NODE_ENV === 'production') {
    app.log.warn('WEB_API_SECRET is unset, so signed-out requests are not rate limited');
  }

  await app.register(rateLimit, {
    global: false,
    ...(redis && { redis }),
    nameSpace: 'ratelimit:',
    skipOnError: true,
    max: (request) => limit(request).max,
    timeWindow: (request) => limit(request).windowMs,
    allowList: (request) => {
      const name = limitFor(request);
      return name === null || (name === 'anonymous' && !env.WEB_API_SECRET);
    },
    keyGenerator: (request) => {
      const who =
        request.actor.kind === 'user' ? request.actor.user.id : ipKey(clientIp(request, env));
      return `${limitFor(request)}:${who}`;
    },
    errorResponseBuilder: (_request, { after, statusCode }) =>
      httpError(statusCode, 'RATE_LIMITED', `Too many requests. Try again in ${after}.`),
  });
  app.addHook('onRequest', app.rateLimit());
}
