# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="9router"

ENV NODE_ENV=production
ENV PORT=10128
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/custom-server.js ./custom-server.js
COPY --from=builder /app/open-sse ./open-sse
# Next file tracing can omit sibling files; MITM runs server.js as a separate process.
COPY --from=builder /app/src/mitm ./src/mitm
# Standalone node_modules may omit deps only required by the MITM child process.
COPY --from=builder /app/node_modules/node-forge ./node_modules/node-forge
# Ensure `next` is available at runtime in case tracing did not include it.
COPY --from=builder /app/node_modules/next ./node_modules/next
# node-machine-id is createRequire-loaded at runtime; tracing omits it.
COPY --from=builder /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data && chown -R node:node /app && \
  mkdir -p /app/data-home && chown node:node /app/data-home && \
  ln -sf /app/data-home /root/.9router 2>/dev/null || true

# Install runtime utilities, Devin CLI, and Tailscale
RUN apt-get update && apt-get install -y --no-install-recommends gosu curl tar ca-certificates iptables && \
  curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg && \
  curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list && \
  apt-get update && apt-get install -y --no-install-recommends tailscale && \
  rm -rf /var/lib/apt/lists/* && \
  curl -fsSL https://static.devin.ai/cli/current/manifest.json | grep -o '"x86_64-unknown-linux"[[:space:]]*:[[:space:]]*{[^}]*}' | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | xargs curl -fsSL | tar -xz -C /tmp && \
  mv /tmp/bin/devin /usr/local/bin/devin && \
  chmod +x /usr/local/bin/devin && \
  rm -rf /tmp/bin /tmp/share

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10128

# Health: Next serves /api/health (dashboardGuard public path).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:10128/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--max-old-space-size=1536", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "custom-server.js"]
