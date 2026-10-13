// Error-reporting privacy settings shared by the api, worker, and web app. Never send tokens,
// cookies, signed URLs, share-link tokens, or request bodies to monitoring (CLAUDE.md section 10).
// These are plain data and pure functions so they're testable without a vendor SDK; each app
// passes them to its Sentry init. Import from `@feedback/shared/monitoring`, not the package root,
// so the browser bundle doesn't pull in the zod schemas.

/**
 * What the SDK may collect on its own. Everything that can carry a secret is off, including
 * local variables in stack frames (a handler's `token` would otherwise be sent).
 */
export const monitoringDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/**
 * Log levels sent to monitoring. Debug and trace stay on stdout only, to keep well inside the
 * free log quota.
 */
export const monitoredLogLevels = ['info', 'warn', 'error', 'fatal'] as const;

/** Request headers worth keeping on an error report; every other header is dropped. */
const allowedHeaders = new Set(['accept', 'content-length', 'content-type', 'user-agent']);

/** Breadcrumb data fields that hold URLs (fetch/xhr/http use `url`, navigation `from`/`to`). */
const breadcrumbUrlFields = ['url', 'from', 'to'];

/** Context and tag keys that hold a URL or path, e.g. the Next.js SDK's `request_path`. */
const urlLikeKey = /(url|path|uri|href)$/i;

/** Drops the query string and fragment, where tokens and signed-URL signatures live. */
export function scrubUrl(url: string): string {
  return url.replace(/[?#].*$/s, '');
}

interface ScrubbableBreadcrumb {
  data?: { [key: string]: unknown };
}

type StringMap = { [key: string]: unknown };

interface ScrubbableEvent {
  contexts?: { [name: string]: StringMap | undefined };
  tags?: StringMap;
  request?: {
    method?: string;
    url?: string;
    headers?: { [key: string]: string };
  };
  breadcrumbs?: ScrubbableBreadcrumb[];
}

/** Strips secrets from a breadcrumb's URLs. Use as `beforeBreadcrumb`. */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const field of breadcrumbUrlFields) {
    const value = data[field];
    if (typeof value === 'string') data[field] = scrubUrl(value);
  }
  return { ...breadcrumb, data };
}

function isPlainObject(value: unknown): value is StringMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Scrubs the URL-like string values in a flat map (a context, the tags, or log attributes). */
function scrubUrlFields<T extends StringMap>(map: T): T {
  const scrubbed: StringMap = { ...map };
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'string' && urlLikeKey.test(key)) scrubbed[key] = scrubUrl(value);
  }
  return scrubbed as T;
}

/**
 * Strips anything secret from an error report before it leaves the process: cookies, bodies,
 * query strings (in the request, breadcrumbs, contexts, and tags), and every header not on the
 * allowlist. Use as `beforeSend`. It backs up `monitoringDataCollection`, in case an
 * integration attaches data anyway.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const scrubbed = { ...event };
  if (event.request) {
    // Keep only these fields: the rest (query_string, cookies, data, env) can all hold secrets.
    const { method, url, headers } = event.request;
    scrubbed.request = {
      ...(method !== undefined && { method }),
      ...(url !== undefined && { url: scrubUrl(url) }),
      ...(headers && {
        headers: Object.fromEntries(
          Object.entries(headers).filter(([name]) => allowedHeaders.has(name.toLowerCase())),
        ),
      }),
    };
  }
  if (event.breadcrumbs) scrubbed.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.tags) scrubbed.tags = scrubUrlFields(event.tags);
  if (event.contexts) {
    scrubbed.contexts = Object.fromEntries(
      Object.entries(event.contexts).map(([name, context]) => [
        name,
        context && scrubUrlFields(context),
      ]),
    );
  }
  return scrubbed;
}

interface ScrubbableLog {
  attributes?: StringMap;
}

/**
 * Prepares a log line for monitoring. Use as `beforeSendLog`.
 *
 * - Flattens one level of nesting into dotted keys (pino's `req: { url }` becomes `req.url`,
 *   `res: { statusCode }` becomes `res.statusCode`), so they're searchable fields instead of
 *   JSON strings.
 * - Strips query strings from URL-like attributes. It backs up the api's request log
 *   serializer, in case a log line carries a URL some other way.
 */
export function scrubLog<T extends ScrubbableLog>(log: T): T {
  if (!log.attributes) return log;
  const flat: StringMap = {};
  for (const [key, value] of Object.entries(log.attributes)) {
    if (isPlainObject(value)) {
      for (const [innerKey, innerValue] of Object.entries(value)) {
        flat[`${key}.${innerKey}`] = innerValue;
      }
    } else {
      flat[key] = value;
    }
  }
  return { ...log, attributes: scrubUrlFields(flat) };
}
