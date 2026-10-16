// Redeploys staging Redis by hand after fly.redis.staging.toml changes (docs/staging.md). It's the
// one deploy that runs from a laptop, so it guards against the two ways that went wrong before: it
// refuses to deploy a config that isn't origin/main's, and it starts the machine if Fly left it
// stopped (a deploy keeps a stopped machine stopped, and nothing can reach Redis until it starts).
//   pnpm staging:redis:deploy
import { spawnSync } from 'node:child_process';

const APP = 'feedback-staging-redis';
const CONFIG = 'fly.redis.staging.toml';

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!run('git', ['fetch', '--quiet', 'origin', 'main']).ok) fail('Could not fetch origin/main.');
const deployed = run('git', ['show', `origin/main:${CONFIG}`]);
const local = run('git', ['diff', '--quiet', 'origin/main', '--', CONFIG]);
if (!deployed.ok || !local.ok) {
  fail(
    `${CONFIG} here differs from origin/main. Deploy only what's merged: check out main and ` +
      'pull, then run this again.',
  );
}

const deploy = spawnSync('fly', ['deploy', '--config', CONFIG], { stdio: 'inherit' });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

const list = run('fly', ['machine', 'list', '-a', APP, '--json']);
if (!list.ok) fail(`Deployed, but could not list machines: ${list.err}`);
const machines = JSON.parse(list.out) as { id: string; state: string }[];
for (const { id, state } of machines) {
  if (state === 'started') continue;
  console.log(`Machine ${id} is ${state}; starting it.`);
  if (spawnSync('fly', ['machine', 'start', id, '-a', APP], { stdio: 'inherit' }).status !== 0) {
    fail(`Could not start ${id}. Check: fly status -a ${APP}`);
  }
}

// Shows the machine and its TCP check. If the check isn't passing, read `fly logs -a <app>`.
spawnSync('fly', ['status', '-a', APP], { stdio: 'inherit' });
console.log('Then confirm the queue: curl https://feedback-staging.fly.dev/v1/health/queue');
