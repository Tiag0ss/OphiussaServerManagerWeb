# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libsqlite3-0 python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# steamcmd (for Workshop downloads)
RUN mkdir -p /opt/steamcmd \
    && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
       | tar -xz -C /opt/steamcmd \
    && /opt/steamcmd/steamcmd.sh +quit || true
ENV STEAMCMD_PATH=/opt/steamcmd/steamcmd.sh
ENV PATH="/opt/steamcmd:${PATH}"

WORKDIR /app
ENV DATA_DIR=/data
ENV NODE_ENV=production
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile

FROM base AS development
ENV NODE_ENV=development
# Lockfile + deps baked into the image; workspace bind-mount overlays source.
# A named volume on /app/node_modules (see devcontainer.json) keeps Linux deps.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
EXPOSE 3000 2121 2022
CMD ["pnpm", "run", "dev"]

FROM deps AS builder
ENV NODE_ENV=production
COPY . .
RUN mkdir -p /data && pnpm run build

FROM base AS production
ENV NODE_ENV=production
# Root is intentional: the panel needs docker.sock (root-equivalent on the host).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
RUN mkdir -p /data /data/servers /data/backups /data/logs
EXPOSE 3000 21 2022
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
