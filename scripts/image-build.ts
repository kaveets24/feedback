// Builds the API/worker server image locally as feedback-server:local, using the Node and pnpm
// versions pinned in .nvmrc and package.json. Extra arguments are passed to `docker build`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const nodeVersion = readFileSync('.nvmrc', 'utf8').trim();
const { packageManager } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  packageManager: string;
};
const pnpmVersion = packageManager.replace(/^pnpm@/, '');

const result = spawnSync(
  'docker',
  [
    'build',
    '--build-arg',
    `NODE_VERSION=${nodeVersion}`,
    '--build-arg',
    `PNPM_VERSION=${pnpmVersion}`,
    '--tag',
    'feedback-server:local',
    ...process.argv.slice(2),
    '.',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
