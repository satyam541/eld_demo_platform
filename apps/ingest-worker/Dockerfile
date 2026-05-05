# Multi-stage build for ingest-worker
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
RUN pnpm --filter ingest-worker build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/ingest-worker/dist ./dist
COPY --from=build /repo/apps/ingest-worker/package.json ./
EXPOSE 2404 9090
CMD ["node", "dist/server.js"]
