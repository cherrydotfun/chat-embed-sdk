# =====================================================================
#  chat-embed-sdk — wallet-only example deploy image
# =====================================================================
#  Builds the SDK (IIFE bundle) and the wallet-only example SPA, then
#  ships a small node:alpine runtime that serves both via Express on
#  port 3000.
#
#  Build args:
#    BASE_PATH   Sub-path mount (e.g. "/chat-embed-example"). Empty for
#                root mount. Must match Traefik's PathPrefix at runtime.
#                Vite bakes this into asset URLs at build time, so the
#                build arg AND the runtime BASE_PATH env on the
#                container must agree.
# =====================================================================

# ---- Stage 1: build the SDK + wallet-only example with bun ----------
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# SDK build (produces /app/dist/index.global.js — served by server.js
# at runtime as /cherry-embed.js).
COPY package.json tsup.config.ts tsconfig.json ./
COPY src/ ./src/
RUN bun install
RUN bun run build

# Wallet-only example build.
WORKDIR /app/example/wallet-only

ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}

COPY example/wallet-only/package.json ./
RUN bun install

COPY example/wallet-only/ ./
RUN bun run build

# ---- Stage 2: minimal runtime ---------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# SDK IIFE bundle — server.js resolves it at __dirname/../../dist/index.global.js
COPY --from=builder /app/dist/index.global.js ./dist/index.global.js

WORKDIR /app/example/wallet-only

# Runtime deps (express, dotenv, react, react-dom). devDeps not needed
# at runtime — Vite/TS were used only in the builder stage.
COPY --from=builder /app/example/wallet-only/package.json ./
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund

# Built SPA + the Express server that serves it.
COPY --from=builder /app/example/wallet-only/dist/ ./dist/
COPY --from=builder /app/example/wallet-only/server.js ./server.js

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
