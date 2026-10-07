import { pino } from 'pino';
import { loadEnv } from './env.ts';

const env = loadEnv();
const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  }),
});

// BullMQ consumers (ffmpeg pipeline) are added in Phase 2. Until then the process just idles
// so `pnpm dev` exercises the same three-process layout as production.
const keepAlive = setInterval(() => {}, 1 << 30);
log.info('worker started (no queues registered yet)');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    clearInterval(keepAlive);
  });
}
