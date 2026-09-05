#!/bin/sh
set -e

# Fix permissions for data directories
chown -R node:node /app/data /app/data-home 2>/dev/null || true

# Tailscale setup
TS_KEY="${TAILSCALE_AUTHKEY:-${TS_AUTHKEY:-${TAILSCALE_KEY:-}}}"

if [ -n "$TS_KEY" ]; then
  echo "[Tailscale] Auth key detected, initializing tailscaled..."
  mkdir -p /var/lib/tailscale /var/run/tailscale /dev/net

  # Determine tun mode
  TUN_ARG=""
  if [ -c /dev/net/tun ]; then
    echo "[Tailscale] /dev/net/tun device found. Using kernel TUN mode."
    TUN_ARG="--tun=tailscale0"
  else
    echo "[Tailscale] /dev/net/tun not found. Using userspace networking mode."
    TUN_ARG="--tun=userspace-networking --socks5-server=localhost:1055 --outbound-http-proxy-listen=localhost:1056"
  fi

  # Start tailscaled in background
  /usr/sbin/tailscaled $TUN_ARG --statedir=/var/lib/tailscale > /tmp/tailscaled.log 2>&1 &
  TS_DAEMON_PID=$!

  # Wait for tailscaled socket ready
  MAX_WAIT=20
  WAITED=0
  while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ $WAITED -lt $MAX_WAIT ]; do
    sleep 0.5
    WAITED=$((WAITED + 1))
  done

  if [ -S /var/run/tailscale/tailscaled.sock ]; then
    echo "[Tailscale] Daemon ready. Authenticating..."
    TS_HOSTNAME="${TAILSCALE_HOSTNAME:-${TS_HOSTNAME:-9router-x}}"
    TS_EXTRA_ARGS="${TAILSCALE_EXTRA_ARGS:-}"

    # Authenticate node
    if /usr/bin/tailscale up --auth-key="$TS_KEY" --hostname="$TS_HOSTNAME" $TS_EXTRA_ARGS; then
      TS_IP=$(/usr/bin/tailscale ip -4 2>/dev/null || true)
      echo "[Tailscale] Connected successfully! Tailscale IP: ${TS_IP:-unknown}"

      # Optional: Auto-serve port 10128 via tailscale serve if requested or in userspace
      if [ "${TAILSCALE_SERVE:-true}" = "true" ]; then
        echo "[Tailscale] Enabling Tailscale Serve for port 10128..."
        /usr/bin/tailscale serve --bg --http=10128 http://127.0.0.1:10128 2>/dev/null || true
      fi
    else
      echo "[Tailscale] Warning: tailscale up failed. Check /tmp/tailscaled.log."
    fi
  else
    echo "[Tailscale] Warning: tailscaled socket not ready after ${MAX_WAIT} checks."
  fi
else
  echo "[Tailscale] No TAILSCALE_AUTHKEY configured. Skipping."
fi

# Hand over to application process
exec gosu node "$@"
