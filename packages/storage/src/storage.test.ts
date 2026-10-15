import { afterAll, describe, expect, it } from 'vitest';
import { loadStorageConfig } from './config.ts';
import { createStorage, MAX_PRESIGN_SECONDS } from './storage.ts';
import { TEST_ORIGIN, testStorageConfig } from './testing.ts';

const config = testStorageConfig('storage');
const storage = createStorage(config);
afterAll(() => storage.close());

// Each test writes its own key, so tests don't depend on each other's objects.
const key = (name: string) => `test/${name}-${crypto.randomUUID()}`;
const audio = (size: number) => new Uint8Array(size).fill(7);

async function upload(objectKey: string, body: Uint8Array, contentType = 'audio/mpeg') {
  const url = await storage.presignUpload({
    key: objectKey,
    contentType: 'audio/mpeg',
    contentLength: 1000,
    expiresIn: 60,
  });
  return fetch(url, { method: 'PUT', body, headers: { 'content-type': contentType } });
}

describe('presignUpload', () => {
  it('accepts a body of exactly the signed size and type', async () => {
    const objectKey = key('upload');
    const res = await upload(objectKey, audio(1000));
    expect(res.status).toBe(200);
    expect(await storage.head(objectKey)).toEqual({ size: 1000, contentType: 'audio/mpeg' });
  });

  it('rejects a body of a different size', async () => {
    const objectKey = key('too-big');
    expect((await upload(objectKey, audio(5000))).status).toBe(403);
    expect((await upload(objectKey, audio(10))).status).toBe(403);
    expect(await storage.head(objectKey)).toBeNull();
  });

  it('rejects a different content type', async () => {
    const objectKey = key('wrong-type');
    expect((await upload(objectKey, audio(1000), 'text/html')).status).toBe(403);
    expect(await storage.head(objectKey)).toBeNull();
  });

  it('refuses expiries longer than the limit and bad sizes', async () => {
    const base = { key: key('x'), contentType: 'audio/mpeg', contentLength: 1 };
    await expect(
      storage.presignUpload({ ...base, expiresIn: MAX_PRESIGN_SECONDS + 1 }),
    ).rejects.toThrow(RangeError);
    await expect(storage.presignUpload({ ...base, expiresIn: 0 })).rejects.toThrow(RangeError);
    await expect(
      storage.presignUpload({ ...base, contentLength: 0, expiresIn: 60 }),
    ).rejects.toThrow(RangeError);
  });
});

describe('presignDownload', () => {
  it('serves the object, including byte ranges for seeking', async () => {
    const objectKey = key('download');
    await upload(objectKey, audio(1000));
    const url = await storage.presignDownload({ key: objectKey, expiresIn: 60 });

    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect((await full.arrayBuffer()).byteLength).toBe(1000);

    const range = await fetch(url, { headers: { range: 'bytes=0-99' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 0-99/1000');
    expect((await range.arrayBuffer()).byteLength).toBe(100);
  });

  it('refuses unsigned, tampered, and expired requests', async () => {
    const objectKey = key('private');
    await upload(objectKey, audio(1000));

    const unsigned = new URL(`${config.endpoint}/${config.bucket}/${objectKey}`);
    expect((await fetch(unsigned)).status).toBe(403);

    const url = new URL(await storage.presignDownload({ key: objectKey, expiresIn: 60 }));
    url.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    expect((await fetch(url)).status).toBe(403);

    const expiring = await storage.presignDownload({ key: objectKey, expiresIn: 1 });
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(expiring)).status).toBe(403);
  });
});

describe('head', () => {
  it('returns null for a missing object', async () => {
    expect(await storage.head(key('missing'))).toBeNull();
  });
});

describe('ensureBucket', () => {
  // A preflight is what the browser sends before a cross-origin PUT with a content type.
  const preflight = (origin: string) =>
    fetch(`${config.endpoint}/${config.bucket}/${key('cors')}`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });

  it('is safe to run again and allows browser uploads only from the given origins', async () => {
    await storage.ensureBucket({ corsOrigins: [TEST_ORIGIN] });

    const allowed = await preflight(TEST_ORIGIN);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);

    const other = await preflight('https://elsewhere.example');
    expect(other.headers.get('access-control-allow-origin')).not.toBe('https://elsewhere.example');
  });
});

describe('loadStorageConfig', () => {
  it('names every missing variable', () => {
    expect(() => loadStorageConfig({})).toThrow(/STORAGE_ENDPOINT[\s\S]*STORAGE_BUCKET/);
  });

  it('maps env vars to config', () => {
    expect(
      loadStorageConfig({
        STORAGE_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
        STORAGE_REGION: 'us-east-005',
        STORAGE_BUCKET: 'b',
        STORAGE_ACCESS_KEY_ID: 'id',
        STORAGE_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({
      endpoint: 'https://s3.us-east-005.backblazeb2.com',
      region: 'us-east-005',
      bucket: 'b',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    });
  });
});
