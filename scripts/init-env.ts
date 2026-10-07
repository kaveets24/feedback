// Creates local env files from their examples. Never overwrites an existing file.
import { copyFileSync, existsSync } from 'node:fs';

const files = [
  ['.env.example', '.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
] as const;

for (const [example, target] of files) {
  if (existsSync(target)) {
    console.log(`${target} already exists; left unchanged.`);
  } else {
    copyFileSync(example, target);
    console.log(`Created ${target} from ${example}.`);
  }
}
console.log('Fill in the Clerk keys (dashboard → API Keys) before running pnpm dev.');
