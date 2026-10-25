# syntax=docker/dockerfile:1

# ---- build ----
FROM node:24-slim AS build
WORKDIR /app
# native modules (better-sqlite3) if no prebuilt binary is available
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

# postinstall (nuxt prepare) needs the sources
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile
RUN pnpm build && pnpm build:mp

# ---- runtime ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/dist/multiplayer ./multiplayer

USER node
EXPOSE 3000
# Web app (default). Multiplayer server from the same image: `node multiplayer/server.mjs` (PORT=2567)
CMD ["node", ".output/server/index.mjs"]
