// Turns the monitoring test errors on or off for the staging api and worker (see docs/staging.md).
// `on` sets MONITORING_TEST_ERRORS=true as a Fly secret, which restarts the machines: the worker
// reports a test error as it starts, and the api serves GET /v1/debug/error, which this script
// then calls once. `off` removes the secret again. Needs `fly auth login`.
//   pnpm staging:test-errors on
//   pnpm staging:test-errors off
import { spawnSync } from 'node:child_process';

const app = 'feedback-staging';
const apiUrl = 'https://feedback-staging.fly.dev';

function fly(args: string[]): void {
  const result = spawnSync('fly', [...args, '--app', app], { stdio: 'inherit' });
  if (result.error) {
    console.error(`Couldn't run fly: ${result.error.message}. Is flyctl installed?`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const mode = process.argv[2];
if (mode === 'off') {
  fly(['secrets', 'unset', 'MONITORING_TEST_ERRORS']);
  console.log('Test errors are off.');
} else if (mode === 'on') {
  // Waits for the restarted machines to pass their health checks before returning.
  fly(['secrets', 'set', 'MONITORING_TEST_ERRORS=true']);
  const res = await fetch(`${apiUrl}/v1/debug/error`);
  console.log(`GET /v1/debug/error -> ${res.status} (expected 500)`);
  console.log(
    'Check Sentry for "Test error from GET /v1/debug/error" and "Test error from worker startup",',
  );
  console.log('then run `pnpm staging:test-errors off`.');
} else {
  console.error('Usage: pnpm staging:test-errors on|off');
  process.exit(1);
}
