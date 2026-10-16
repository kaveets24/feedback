import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from './config.ts';

/**
 * Longest a presigned URL may live (CLAUDE.md section 6, rule 5: 5 to 15 minutes). Presigned
 * URLs are bearer credentials: never log them or send them to monitoring.
 */
export const MAX_PRESIGN_SECONDS = 15 * 60;

export interface PresignUploadInput {
  key: string;
  contentType: string;
  /** Exact size in bytes. It's signed into the URL, so the upload must be exactly this size. */
  contentLength: number;
  expiresIn: number;
}

export interface PresignDownloadInput {
  key: string;
  expiresIn: number;
}

export interface ObjectInfo {
  size: number;
  contentType: string | undefined;
}

function checkExpiry(expiresIn: number) {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_PRESIGN_SECONDS) {
    throw new RangeError(`expiresIn must be 1 to ${MAX_PRESIGN_SECONDS} seconds`);
  }
}

/** Object storage over the S3 API. Works with SeaweedFS (local, CI) and Backblaze B2. */
export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Bucket in the path (endpoint/bucket/key) rather than the hostname, so the same config
    // works for SeaweedFS on localhost and for B2.
    forcePathStyle: true,
    // The SDK's default flexible checksums sign a CRC32 of the (empty) body into presigned PUT
    // URLs, so every real upload fails with BadDigest. Only send checksums when an operation
    // requires one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const { bucket } = config;

  return {
    bucket,

    /** A URL the browser can PUT the file to directly. Rejects a different size or type. */
    async presignUpload({ key, contentType, contentLength, expiresIn }: PresignUploadInput) {
      checkExpiry(expiresIn);
      if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
        throw new RangeError('contentLength must be a positive integer');
      }
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      return getSignedUrl(client, command, {
        expiresIn,
        signableHeaders: new Set(['content-length', 'content-type']),
      });
    },

    /** A short-lived URL for reading one object. Supports range requests (audio seeking). */
    async presignDownload({ key, expiresIn }: PresignDownloadInput) {
      checkExpiry(expiresIn);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn,
      });
    },

    /** Size and type of an object, or null if it doesn't exist. */
    async head(key: string): Promise<ObjectInfo | null> {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (err) {
        if (err instanceof NotFound) return null;
        throw err;
      }
    },

    /**
     * The first `length` bytes of an object (fewer if it's shorter), or null if it doesn't
     * exist. Used to check what an uploaded file really is without downloading all of it.
     */
    async readStart(key: string, length: number): Promise<Uint8Array | null> {
      if (!Number.isSafeInteger(length) || length < 1) {
        throw new RangeError('length must be a positive integer');
      }
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }),
        );
        return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },

    /**
     * Creates the bucket if needed and sets its CORS rules, so browsers on `origins` can upload
     * and play directly. Safe to run repeatedly. Used by local setup and tests; staging's B2
     * bucket is set up by hand (docs/staging.md).
     */
    async ensureBucket({ corsOrigins }: { corsOrigins: string[] }) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (err) {
        const owned =
          err instanceof S3ServiceException &&
          (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists');
        if (!owned) throw err;
      }
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: corsOrigins,
                AllowedMethods: ['GET', 'HEAD', 'PUT'],
                AllowedHeaders: ['content-type', 'range'],
                ExposeHeaders: ['content-length', 'content-range', 'etag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    },

    /** Closes the client's connections. */
    close() {
      client.destroy();
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
