FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @eld/db db:generate
RUN pnpm --filter @eld/shared build
RUN pnpm --filter portal build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo /repo
WORKDIR /repo/apps/portal
EXPOSE 3000
CMD ["pnpm", "start"]
