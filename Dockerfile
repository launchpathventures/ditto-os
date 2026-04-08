# Ditto — Multi-stage Production Dockerfile
#
# Builds the complete Ditto application (engine + web) using
# Next.js standalone output mode for minimal image size.
#
# Provenance: Brief 086, Next.js standalone deployment pattern.

# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy package manifests for cache-friendly installs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/web/package.json packages/web/package.json

RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build the application
# ============================================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy source code
COPY . .

# Build Next.js standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ditto/web build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 ditto && \
    adduser --system --uid 1001 ditto

# Copy standalone Next.js server
COPY --from=builder /app/packages/web/.next/standalone ./
# Copy static assets
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder /app/packages/web/public ./packages/web/public

# Copy engine source (needed for lazy imports from API routes)
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

# Copy @ditto/core package source (runtime dependency via workspace:*)
COPY --from=builder /app/packages/core ./packages/core

# Copy process templates, persona config, and cognitive framework
COPY --from=builder /app/processes ./processes
COPY --from=builder /app/cognitive ./cognitive
COPY --from=builder /app/docs/ditto-character.md ./docs/ditto-character.md

# Copy drizzle config for schema sync
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Install production dependencies for engine (better-sqlite3, drizzle, etc.)
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --prod

# Create data directory for SQLite volume mount
RUN mkdir -p /app/data && chown ditto:ditto /app/data

USER ditto

EXPOSE 3000

# PORT is set by the platform (Railway uses 8080, Fly uses 3000)
# Default to 3000 if not set by platform
ENV PORT=${PORT:-3000}
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "packages/web/server.js"]
