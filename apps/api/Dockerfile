FROM node:20-alpine AS base

# Install pnpm (match version in root package.json)
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

WORKDIR /app

# Build stage
FROM base AS builder

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/core/package.json ./packages/core/
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/infra/package.json ./packages/infra/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/api ./apps/api
COPY packages/types ./packages/types
COPY packages/core ./packages/core
COPY packages/domain ./packages/domain
COPY packages/application ./packages/application
COPY packages/infrastructure ./packages/infrastructure
COPY packages/integrations ./packages/integrations
COPY packages/infra ./packages/infra

# Build all packages
RUN pnpm turbo build --filter=@medicalcor/api

# Production stage
FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/types/dist ./packages/types/dist

COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist ./packages/core/dist

COPY --from=builder /app/packages/domain/package.json ./packages/domain/
COPY --from=builder /app/packages/domain/dist ./packages/domain/dist

COPY --from=builder /app/packages/application/package.json ./packages/application/
COPY --from=builder /app/packages/application/dist ./packages/application/dist

COPY --from=builder /app/packages/infrastructure/package.json ./packages/infrastructure/
COPY --from=builder /app/packages/infrastructure/dist ./packages/infrastructure/dist

COPY --from=builder /app/packages/integrations/package.json ./packages/integrations/
COPY --from=builder /app/packages/integrations/dist ./packages/integrations/dist

COPY --from=builder /app/packages/infra/package.json ./packages/infra/
COPY --from=builder /app/packages/infra/dist ./packages/infra/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify
USER fastify

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "apps/api/dist/index.js"]
