# Multi-stage Dockerfile for @evergreen/keeper
FROM node:20-slim AS builder

WORKDIR /app

# Copy root monorepo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/keeper ./packages/keeper

# Install pnpm and dependencies
RUN npm install -g pnpm@9
RUN pnpm install --frozen-lockfile

# Build core and keeper
RUN pnpm --filter "@evergreen/core" build
RUN pnpm --filter "@evergreen/keeper" build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/keeper/package.json ./packages/keeper/

RUN npm install -g pnpm@9
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/keeper/dist ./packages/keeper/dist

EXPOSE 8742

CMD ["node", "packages/keeper/dist/index.js"]
