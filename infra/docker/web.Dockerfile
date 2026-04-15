FROM node:22-alpine AS base

WORKDIR /app

FROM base AS builder

COPY package.json package-lock.json ./
RUN npm ci --include=workspace || npm ci --include=workspace || npm ci --include=workspace

COPY . .
RUN npm run typecheck
RUN npm run lint

FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/apps/web/public /app/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN npm install -g serve

EXPOSE 8080

CMD ["serve", "-s", "/app/public", "-l", "8080", "--no-clipboard"]
