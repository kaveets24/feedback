// Runs the admin CLI (packages/db/src/scripts/admin.ts) against staging. It runs inside a staging
// api machine over `fly ssh`, using the deployed code and the DATABASE_URL secret already there,
// so the staging database credentials never touch this machine. Needs `fly auth login`.
//   pnpm staging:admin approve <email> [--by <admin-email>]
//   pnpm staging:admin reject <email>
import { spawnSync } from 'node:child_process';

const usage = `Usage:
  pnpm staging:admin approve <email> [--by <admin-email>]
  pnpm staging:admin reject <email>`;

const args = process.argv.slice(2);
// fly ssh -C takes one command string, so only allow characters that can't change its meaning.
// The admin script itself validates the command and emails.
if (args.length === 0 || !args.every((arg) => /^[\w.@+-]+$/.test(arg))) {
  console.error(usage);
  process.exit(1);
}

const ssh = spawnSync(
  'fly',
  [
    'ssh',
    'console',
    '--app',
    'feedback-staging',
    '--process-group',
    'api',
    '--command',
    `node packages/db/src/scripts/admin.ts ${args.join(' ')}`,
  ],
  { stdio: 'inherit' },
);
if (ssh.error) {
  console.error(`Couldn't run fly: ${ssh.error.message}. Is flyctl installed?`);
  process.exit(1);
}
process.exit(ssh.status ?? 1);
