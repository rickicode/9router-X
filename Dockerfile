# syntax=docker/dockerfile:1.7
# Pin Debian base (not upstream Alpine) to keep libc/runtime and npm stable.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
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

# Network-heavy runtime tools are independent of application sources/build output.
# Keep each installer separate so a failed download can reuse completed layers.
# Refresh moving Tailscale/Devin releases explicitly with:
# docker buildx build --no-cache-filter runtime-deps --load -t 9router .
FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /app

RUN apt-get -o Acquire::Retries=3 update && \
  apt-get -o Acquire::Retries=3 install -y --no-install-recommends gosu curl tar ca-certificates iptables && \
  rm -rf /var/lib/apt/lists/*

RUN curl --retry 3 --connect-timeout 30 --max-time 300 -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg && \
  curl --retry 3 --connect-timeout 30 --max-time 300 -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list && \
  apt-get -o Acquire::Retries=3 update && \
  apt-get -o Acquire::Retries=3 install -y --no-install-recommends tailscale && \
  rm -rf /var/lib/apt/lists/*

# Download separately: shell pipelines can hide manifest/download failures.
# Preserve the existing x86_64 Devin artifact selection.
RUN curl --retry 3 --connect-timeout 30 --max-time 300 -fsSL https://static.devin.ai/cli/current/manifest.json -o /tmp/devin-manifest.json && \
  node -e 'const fs = require("node:fs"); const m = JSON.parse(fs.readFileSync("/tmp/devin-manifest.json", "utf8")); const url = m.platforms?.["x86_64-unknown-linux"]?.url; if (!url) throw new Error("Missing Devin x86_64 download URL"); fs.writeFileSync("/tmp/devin-url", url)' && \
  curl --retry 3 --connect-timeout 30 --max-time 300 -fsSL "$(cat /tmp/devin-url)" -o /tmp/devin.tar.gz && \
  tar -xzf /tmp/devin.tar.gz -C /tmp && \
  mv /tmp/bin/devin /usr/local/bin/devin && \
  chmod +x /usr/local/bin/devin && \
  rm -rf /tmp/bin /tmp/share /tmp/devin-manifest.json /tmp/devin-url /tmp/devin.tar.gz

FROM runtime-deps AS runner

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

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10128

# Health: Next serves /api/health (dashboardGuard public path).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:10128/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--max-old-space-size=1536", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "custom-server.js"]
