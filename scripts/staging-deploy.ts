// Redeploys an earlier commit to staging (the rollback step in docs/staging.md). The deploy
// itself runs in GitHub Actions, never from this machine: this only starts the workflow, which
// deploys the image CI already built for that commit.
//   pnpm staging:deploy <sha>
import { spawnSync } from 'node:child_process';

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

const ref = process.argv[2];
if (!ref) {
  console.error('Usage: pnpm staging:deploy <sha>');
  process.exit(1);
}

run('git', ['fetch', '--quiet', 'origin', 'main']);
const sha = run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
if (!sha.ok) {
  console.error(`Unknown commit: ${ref}`);
  process.exit(1);
}
// Only commits on main have an image in GHCR (CI pushes images for main only).
if (!run('git', ['merge-base', '--is-ancestor', sha.out, 'origin/main']).ok) {
  console.error(`${sha.out} is not on origin/main, so CI never built an image for it.`);
  process.exit(1);
}

const dispatch = spawnSync(
  'gh',
  ['workflow', 'run', 'deploy-staging.yml', '--ref', 'main', '-f', `sha=${sha.out}`],
  { stdio: 'inherit' },
);
if (dispatch.status !== 0) process.exit(dispatch.status ?? 1);
console.log(`Deploying ${sha.out} to staging. Follow it with: gh run watch`);
