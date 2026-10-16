# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Server image for the API and worker (see docs/decisions/0003). Node runs the TypeScript sources
# directly, so there's no build step: install production dependencies, then copy the sources.
#
# Build with `pnpm image:build`, which passes the Node and pnpm versions pinned in .nvmrc and
# package.json (the version ARGs have no defaults on purpose, so they can't drift). The default
# command runs the API; the worker and migrations override it:
#   node apps/worker/src/index.ts
#   node packages/db/src/scripts/migrate.ts

ARG NODE_VERSION

# Static ffmpeg and ffprobe builds for the worker's audio pipeline, pinned by digest: the same
# version as local dev (Homebrew), and 226 MB against 406 MB for Debian's older ffmpeg package.
FROM mwader/static-ffmpeg:9.0.2-1@sha256:f5d100184884eb3e82b0eb14bb5ebf98da99826ac824989720297fb9ef21c822 AS ffmpeg

FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
# Every workspace manifest is copied so the frozen lockfile matches, but only the API and worker
# (and the packages they depend on) get their dependencies installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/authz/package.json packages/authz/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter '@feedback/api...' --filter '@feedback/worker...' --filter '!@feedback/config'

FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
WORKDIR /app
COPY --from=deps /app ./
COPY packages/authz/src packages/authz/src
COPY packages/shared/src packages/shared/src
COPY packages/storage/src packages/storage/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY apps/api/src apps/api/src
COPY apps/worker/src apps/worker/src
# The commit this image was built from, so error reports name their release. Last, because it
# changes every build.
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
USER node
EXPOSE 4000
CMD ["node", "apps/api/src/server.ts"]
