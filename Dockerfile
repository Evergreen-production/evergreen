# Multi-stage image for the keeper service. This file lives at the repository
# root so Vercel's container builder can access the pnpm workspace packages.
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/keeper ./packages/keeper

RUN npm install -g pnpm@9.15.9
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@evergreen/core" build
RUN pnpm --filter "@evergreen/keeper" build

FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/keeper/package.json ./packages/keeper/

RUN npm install -g pnpm@9.15.9
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/keeper/dist ./packages/keeper/dist

EXPOSE 8742
CMD ["node", "packages/keeper/dist/index.js"]
