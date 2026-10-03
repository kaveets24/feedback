# 0001: Runtime and toolchain versions

- **Status:** accepted
- **Date:** 2026-10-02

## Decision

- **Node 26** (pinned in `.nvmrc`). Node 25+ no longer bundles corepack, so pnpm is installed
  separately (`npm i -g pnpm`) and pinned via `packageManager` in the root `package.json`.
- **TypeScript 6.0**, not 7. `typescript-eslint` only supports `<6.1`, and we want type-aware
  linting available. Revisit when typescript-eslint supports TS 7.
- **ESLint 9**, not 10. `eslint-config-next` depends on React/import/a11y plugins that don't
  declare ESLint 10 support yet.
- **No build step for API and worker.** They run TypeScript directly with Node's built-in type
  stripping (`node src/server.ts`). Consequences:
  - Only erasable TS syntax (`erasableSyntaxOnly`): no `enum`, `namespace`, or parameter
    properties. Use `as const` objects/unions instead.
  - Relative imports use the `.ts` extension (`allowImportingTsExtensions`).
  - Workspace packages export their `src/*.ts` directly; Next.js compiles them via
    `transpilePackages`.
