# One image for the web app and the background workers (APP_ROLE picks what a container runs).

# ---- build: install exactly what pnpm-lock.yaml says, then build the Nuxt server bundle
# Node 22.23.4 or later: 22.23.0 breaks gzip responses for node-fetch (used by Google's libraries), so
# signing in with Google failed with "Premature close" at the token exchange
FROM node:22.23.4-bookworm-slim AS builder
WORKDIR /app

# pnpm comes from package.json's "packageManager" via corepack; WhatsApp uses the system Chromium
# installed below, so Puppeteer's own browser download is skipped
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PUPPETEER_SKIP_DOWNLOAD=true
RUN corepack enable

# Dependencies first, so source changes don't reinstall them. Scripts are skipped here (the
# postinstall needs the sources); sharp's own script then fetches its native binary.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild sharp

COPY . .
# the extra memory is for the build only, not the running server
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm build

# ---- run: the built bundle, Chromium for WhatsApp, and a non-root user
FROM node:22.23.4-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    EMBEDDINGS_CACHE_DIR=/app/data/models

COPY --from=builder --chown=node:node /app/.output ./.output
# volumes mount here: the WhatsApp session and the downloaded embedding model
RUN mkdir -p /app/whatsapp-auth /app/data/models && chown -R node:node /app/whatsapp-auth /app/data
USER node

EXPOSE 3000
# healthy once the app answers and the database is reachable (Qdrant, Redis and the AI model are reported, not required)
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
