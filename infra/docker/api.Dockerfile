FROM node:22-alpine AS base

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --include=workspace || npm ci --include=workspace || npm ci --include=workspace

FROM base AS builder
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN npm run typecheck
  # RUN npm run lint

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps /app/apps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/biome.json ./
COPY --from=builder /app/infra /app/infra

EXPOSE 3001

CMD ["node", "apps/api/src/server.js"]
