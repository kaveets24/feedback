import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubUrl } from './monitoring.ts';

describe('scrubUrl', () => {
  it('drops the query string and fragment', () => {
    expect(scrubUrl('https://x.test/a/b?token=secret&x=1#frag')).toBe('https://x.test/a/b');
    expect(scrubUrl('/v1/me?sig=abc')).toBe('/v1/me');
    expect(scrubUrl('/v1/me#access_token=abc')).toBe('/v1/me');
    expect(scrubUrl('https://x.test/plain')).toBe('https://x.test/plain');
  });
});

describe('scrubEvent', () => {
  const event = {
    message: 'boom',
    request: {
      url: 'https://api.test/v1/tracks?token=secret',
      method: 'GET',
      query_string: 'token=secret',
      cookies: { __session: 'jwt' },
      data: { password: 'hunter2' },
      headers: {
        Authorization: 'Bearer jwt',
        cookie: '__session=jwt',
        'X-Forwarded-For': '203.0.113.7',
        'User-Agent': 'curl/8',
        'content-type': 'application/json',
      },
    },
    contexts: {
      // The Next.js SDK records the raw request path, query string included.
      nextjs: { request_path: '/s/abc?token=secret', router_path: '/s/[id]' },
      runtime: { name: 'node', version: 'v24' },
    },
    tags: { service: 'web', url: 'https://x.test/p?sig=secret' },
    breadcrumbs: [
      { category: 'fetch', data: { url: '/v1/me?token=secret', method: 'GET' } },
      { category: 'navigation', data: { from: '/s/a?t=1', to: '/s/b#t=2' } },
      { category: 'console', message: 'hi' },
    ],
  };

  it('removes cookies, bodies, query strings, and non-allowlisted headers', () => {
    const { request } = scrubEvent(event);
    expect(request).toEqual({
      url: 'https://api.test/v1/tracks',
      method: 'GET',
      headers: { 'User-Agent': 'curl/8', 'content-type': 'application/json' },
    });
  });

  it('leaves no secret anywhere in the event', () => {
    const json = JSON.stringify(scrubEvent(event));
    for (const secret of ['secret', 'jwt', 'hunter2', '203.0.113.7', 't=1', 't=2']) {
      expect(json).not.toContain(secret);
    }
  });

  it('scrubs URLs and paths in contexts and tags, leaving other values alone', () => {
    const { contexts, tags } = scrubEvent(event);
    expect(contexts).toEqual({
      nextjs: { request_path: '/s/abc', router_path: '/s/[id]' },
      runtime: { name: 'node', version: 'v24' },
    });
    expect(tags).toEqual({ service: 'web', url: 'https://x.test/p' });
  });

  it('scrubs breadcrumb URLs and keeps their other fields', () => {
    expect(scrubEvent(event).breadcrumbs).toEqual([
      { category: 'fetch', data: { url: '/v1/me', method: 'GET' } },
      { category: 'navigation', data: { from: '/s/a', to: '/s/b' } },
      { category: 'console', message: 'hi' },
    ]);
  });

  it('does not modify the original event', () => {
    const before = JSON.stringify(event);
    scrubEvent(event);
    expect(JSON.stringify(event)).toBe(before);
  });

  it('handles events without request data or breadcrumbs', () => {
    const bare: Parameters<typeof scrubEvent>[0] & { message: string } = { message: 'x' };
    expect(scrubEvent(bare)).toEqual({ message: 'x' });
  });
});

describe('scrubBreadcrumb', () => {
  it('ignores non-string URL fields', () => {
    expect(scrubBreadcrumb({ data: { url: 42 } })).toEqual({ data: { url: 42 } });
  });
});

describe('scrubLog', () => {
  it("flattens pino's nested objects and scrubs URL-like attributes", () => {
    const log = {
      level: 'info',
      message: 'incoming request',
      attributes: {
        reqId: 'req-1',
        url: '/v1/me?token=secret',
        req: { method: 'GET', url: '/v1/tracks?sig=secret', remotePort: 5000 },
        res: { statusCode: 200 },
        tags: ['a', 'b'],
      },
    };
    expect(scrubLog(log)).toEqual({
      level: 'info',
      message: 'incoming request',
      attributes: {
        reqId: 'req-1',
        url: '/v1/me',
        'req.method': 'GET',
        'req.url': '/v1/tracks',
        'req.remotePort': 5000,
        'res.statusCode': 200,
        tags: ['a', 'b'],
      },
    });
  });

  it('does not modify the original log', () => {
    const log = { attributes: { req: { url: '/x?token=secret' } } };
    scrubLog(log);
    expect(log).toEqual({ attributes: { req: { url: '/x?token=secret' } } });
  });

  it('handles logs without attributes', () => {
    const bare: Parameters<typeof scrubLog>[0] & { message: string } = { message: 'x' };
    expect(scrubLog(bare)).toEqual({ message: 'x' });
  });
});
