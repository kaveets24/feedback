import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./vitest.global-setup.ts'],
    // Test files share one database and queue; run them one at a time.
    fileParallelism: false,
    // ffmpeg runs for real, and the queue tests wait on BullMQ.
    testTimeout: 20_000,
  },
});
