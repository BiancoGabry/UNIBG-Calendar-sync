# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV TZ=Europe/Rome
RUN npm install -g pnpm@12.6.0
WORKDIR /app

# All dependencies (build tools for better-sqlite3 in case no prebuilt binary matches).
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Production dependencies only (worker runtime).
FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- web: Next.js standalone server --------------------------------------------
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle DATABASE_URL=file:/data/unibg.db
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# --- worker: node-cron scheduler -------------------------------------------------
FROM base AS worker
ENV NODE_ENV=production UNIBG_PROCESS=worker MIGRATIONS_DIR=/app/drizzle DATABASE_URL=file:/data/unibg.db
RUN mkdir -p /data && chown node:node /data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
COPY drizzle ./drizzle
USER node
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node_modules/.bin/tsx", "worker/healthcheck.ts"]
CMD ["node_modules/.bin/tsx", "worker/index.ts"]
