FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/ingest-worker/package.json apps/ingest-worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @eld/db db:generate || true
RUN pnpm --filter @eld/shared build
RUN pnpm --filter ingest-worker build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/ingest-worker
EXPOSE 2404 9090
CMD ["node", "dist/server.js"]
