import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAccessStatus, upsertUserFromAuth, type Db } from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import { CLIENT_IP_HEADER, WEB_SECRET_HEADER } from '@feedback/shared';
import type { App } from './app.ts';
import { ipKey, RATE_LIMITS, rateLimitRedis, type RateLimitDeps } from './rate-limit.ts';
import { buildTestApp, tokenFor } from './testing/app.ts';

const SECRET = 'a-test-secret-that-is-long-enough-to-pass';
const UUID = '01a1a3fd-0000-7000-8000-000000000000';

describe('rate limits', () => {
  const apps: App[] = [];
  let db: Db;

  async function appWith(
    env: NodeJS.ProcessEnv = { WEB_API_SECRET: SECRET },
    rateLimits: RateLimitDeps = {},
  ) {
    const built = await buildTestApp({ env, rateLimits });
    apps.push(built.app);
    db = built.db;
    await resetDb(db);
    return built.app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  type Options = {
    as?: string;
    headers?: Record<string, string>;
    remoteAddress?: string;
  };

  const send = (app: App, method: 'GET' | 'POST', url: string, options: Options = {}) =>
    app.inject({
      method,
      url,
      ...(options.remoteAddress && { remoteAddress: options.remoteAddress }),
      headers: {
        ...(options.as && { authorization: `Bearer ${tokenFor(options.as)}` }),
        ...options.headers,
      },
    });

  /** Sends `times` requests in order, returning the last. */
  async function hit(
    app: App,
    times: number,
    method: 'GET' | 'POST',
    url: string,
    options: Options = {},
  ) {
    let last = await send(app, method, url, options);
    for (let i = 1; i < times; i++) last = await send(app, method, url, options);
    return last;
  }

  // These send no body, so the handlers refuse them with a 400 and nothing is created: the limit
  // is checked first, so they still count.
  it.each([
    ['POST /v1/uploads', 'POST', '/v1/uploads', RATE_LIMITS.upload.max],
    ['POST /v1/tracks/:id/versions', 'POST', `/v1/tracks/${UUID}/versions`, RATE_LIMITS.upload.max],
    ['POST /v1/projects/:id/covers', 'POST', `/v1/projects/${UUID}/covers`, RATE_LIMITS.upload.max],
    ['POST /v1/me/avatars', 'POST', '/v1/me/avatars', RATE_LIMITS.upload.max],
    [
      'POST /v1/versions/:id/feedback',
      'POST',
      `/v1/versions/${UUID}/feedback`,
      RATE_LIMITS.comment.max,
    ],
    [
      'POST /v1/feedback/:id/replies',
      'POST',
      `/v1/feedback/${UUID}/replies`,
      RATE_LIMITS.comment.max,
    ],
    ['another write', 'POST', '/v1/projects', RATE_LIMITS.write.max],
    ['a read', 'GET', '/v1/notifications', RATE_LIMITS.read.max],
  ] as const)('allows %s up to its limit, then says so', async (_name, method, url, max) => {
    const app = await appWith();
    await upsertUserFromAuth(db, { authProviderId: 'u1', email: 'u1@x.test' });
    await setAccessStatus(db, { email: 'u1@x.test', status: 'approved' });

    const last = await hit(app, max, method, url, { as: 'u1' });
    expect(last.statusCode).not.toBe(429);

    const over = await send(app, method, url, { as: 'u1' });
    expect(over.statusCode).toBe(429);
    expect(over.json().error.code).toBe('RATE_LIMITED');
    expect(over.json().error.message).toMatch(/^Too many requests\. Try again in /);
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('shares one upload limit across the routes that start uploads', async () => {
    const app = await appWith();
    await upsertUserFromAuth(db, { authProviderId: 'u1', email: 'u1@x.test' });
    await setAccessStatus(db, { email: 'u1@x.test', status: 'approved' });

    await hit(app, RATE_LIMITS.upload.max, 'POST', '/v1/uploads', { as: 'u1' });
    const res = await send(app, 'POST', '/v1/me/avatars', { as: 'u1' });
    expect(res.statusCode).toBe(429);
  });

  it('counts each kind of request, and each account, separately', async () => {
    const app = await appWith();
    for (const id of ['u1', 'u2']) {
      await upsertUserFromAuth(db, { authProviderId: id, email: `${id}@x.test` });
      await setAccessStatus(db, { email: `${id}@x.test`, status: 'approved' });
    }

    await hit(app, RATE_LIMITS.upload.max + 1, 'POST', '/v1/uploads', { as: 'u1' });
    expect((await send(app, 'POST', '/v1/uploads', { as: 'u1' })).statusCode).toBe(429);

    expect((await send(app, 'POST', '/v1/projects', { as: 'u1' })).statusCode).not.toBe(429);
    expect((await send(app, 'GET', '/v1/notifications', { as: 'u1' })).statusCode).toBe(200);
    expect((await send(app, 'POST', '/v1/uploads', { as: 'u2' })).statusCode).not.toBe(429);
  });

  it('counts accounts waiting for approval, whom the gate would otherwise turn away', async () => {
    const app = await appWith();
    const last = await hit(app, RATE_LIMITS.write.max, 'POST', '/v1/projects', { as: 'waiting' });
    expect(last.statusCode).toBe(403);
    expect((await send(app, 'POST', '/v1/projects', { as: 'waiting' })).statusCode).toBe(429);
  });

  it('never limits the health checks or the API description', async () => {
    const app = await appWith();
    const over = RATE_LIMITS.anonymous.max + 5;
    expect((await hit(app, over, 'GET', '/v1/health')).statusCode).toBe(200);
    expect((await hit(app, 5, 'GET', '/v1/openapi.json')).statusCode).toBe(200);
    expect((await hit(app, over, 'GET', '/v1/nothing-here')).statusCode).toBe(429);
    expect((await send(app, 'GET', '/v1/health')).statusCode).toBe(200);
  });

  describe('signed-out requests', () => {
    const fromWeb = (ip: string, secret = SECRET) => ({
      headers: { [WEB_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: ip },
    });
    const max = RATE_LIMITS.anonymous.max;

    it('counts visitors the web app vouches for separately', async () => {
      const app = await appWith();
      await hit(app, max, 'GET', '/v1/nothing-here', fromWeb('203.0.113.1'));
      const over = await send(app, 'GET', '/v1/nothing-here', fromWeb('203.0.113.1'));
      expect(over.statusCode).toBe(429);
      const other = await send(app, 'GET', '/v1/nothing-here', fromWeb('203.0.113.2'));
      expect(other.statusCode).toBe(404);
    });

    it('ignores an address passed without the secret, or with the wrong one', async () => {
      const app = await appWith();
      const caller = { remoteAddress: '198.51.100.7' };
      const spoof = (i: number, secret?: string) => ({
        ...caller,
        headers: {
          [CLIENT_IP_HEADER]: `203.0.113.${(i % 200) + 1}`,
          ...(secret && { [WEB_SECRET_HEADER]: secret }),
        },
      });
      for (let i = 0; i < max; i++) {
        const secret = i % 2 ? 'the-wrong-secret' : undefined;
        await send(app, 'GET', '/v1/nothing-here', spoof(i, secret));
      }
      const over = await send(app, 'GET', '/v1/nothing-here', spoof(max));
      expect(over.statusCode).toBe(429);
    });

    it('ignores a forwarded value that is not an address, even with the secret', async () => {
      const app = await appWith();
      const options = (value: string) => ({
        remoteAddress: '198.51.100.8',
        ...fromWeb(value),
      });
      for (let i = 0; i < max; i++) {
        await send(app, 'GET', '/v1/nothing-here', options(`not-an-ip-${i}`));
      }
      const over = await send(app, 'GET', '/v1/nothing-here', options('still-not-an-ip'));
      expect(over.statusCode).toBe(429);
    });

    it('uses Fly’s address only on Fly', async () => {
      const onFly = await appWith({ WEB_API_SECRET: SECRET, FLY_APP_NAME: 'feedback' });
      const fly = (ip: string) => ({
        remoteAddress: '198.51.100.9',
        headers: { 'fly-client-ip': ip },
      });
      await hit(onFly, max + 1, 'GET', '/v1/nothing-here', fly('203.0.113.3'));
      const limited = await send(onFly, 'GET', '/v1/nothing-here', fly('203.0.113.3'));
      expect(limited.statusCode).toBe(429);
      const other = await send(onFly, 'GET', '/v1/nothing-here', fly('203.0.113.4'));
      expect(other.statusCode).toBe(404);

      const offFly = await appWith();
      await hit(offFly, max + 1, 'GET', '/v1/nothing-here', fly('203.0.113.3'));
      const sameSocket = await send(offFly, 'GET', '/v1/nothing-here', fly('203.0.113.4'));
      expect(sameSocket.statusCode).toBe(429);
    });

    it('counts a whole IPv6 /64 together', async () => {
      const app = await appWith();
      await hit(app, max, 'GET', '/v1/nothing-here', fromWeb('2001:db8:1:2::a'));
      const same = await send(app, 'GET', '/v1/nothing-here', fromWeb('2001:db8:1:2::b'));
      expect(same.statusCode).toBe(429);
      const other = await send(app, 'GET', '/v1/nothing-here', fromWeb('2001:db8:1:3::a'));
      expect(other.statusCode).toBe(404);
    });

    it('is off without the secret, since everyone would share one count', async () => {
      const app = await appWith({});
      const last = await hit(app, max + 5, 'GET', '/v1/nothing-here');
      expect(last.statusCode).toBe(404);
    });
  });

  describe('with Redis', () => {
    const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
    const redis = rateLimitRedis(redisUrl);
    redis.on('error', () => {});

    beforeEach(async () => {
      if (redis.status !== 'ready') await new Promise((resolve) => redis.once('ready', resolve));
    });
    afterAll(() => redis.disconnect());

    it('shares the count between API machines', async () => {
      const one = await appWith(undefined, { redis });
      const two = await buildTestApp({ env: { WEB_API_SECRET: SECRET }, rateLimits: { redis } });
      apps.push(two.app);
      // Unique, since the counts outlive the test by up to a minute.
      const visitor = randomUUID();
      const headers = {
        [WEB_SECRET_HEADER]: SECRET,
        [CLIENT_IP_HEADER]: `2001:db8:${visitor.slice(0, 4)}:${visitor.slice(9, 13)}::1`,
      };

      const half = Math.ceil(RATE_LIMITS.anonymous.max / 2);
      await hit(one, half, 'GET', '/v1/nothing-here', { headers });
      await hit(two.app, RATE_LIMITS.anonymous.max - half, 'GET', '/v1/nothing-here', { headers });
      expect((await send(one, 'GET', '/v1/nothing-here', { headers })).statusCode).toBe(429);
    });

    it('lets requests through when Redis is down', async () => {
      const down = rateLimitRedis('redis://127.0.0.1:1');
      down.on('error', () => {});
      const app = await appWith(undefined, { redis: down });
      const last = await hit(app, RATE_LIMITS.anonymous.max + 5, 'GET', '/v1/nothing-here');
      expect(last.statusCode).toBe(404);
      down.disconnect();
    });
  });

  describe('ipKey', () => {
    it.each([
      ['203.0.113.1', '203.0.113.1'],
      ['::ffff:203.0.113.1', '203.0.113.1'],
      ['2001:db8:1:2::a', '2001:db8:1:2::/64'],
      ['2001:DB8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
      ['2001:0db8:0001:0002::', '2001:db8:1:2::/64'],
      ['::1', '0:0:0:0::/64'],
      ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ])('%s counts as %s', (ip, key) => {
      expect(ipKey(ip)).toBe(key);
    });
  });
});
