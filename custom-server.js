const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");
const { pathToFileURL } = require("url");

const origCreate = http.createServer.bind(http);

// Streaming gzip for compressible text responses (HTML/JS/CSS/JSON/SVG).
// Skips SSE (event-stream), already-encoded bodies, HEAD, 204/304, and
// non-text payloads. Data flows chunk-by-chunk (no full-body buffering).
const COMPRESSIBLE_RE = /^(text\/|application\/(?:json|javascript|x-javascript|xml|svg\+xml))/;

function wrapCompression(req, res) {
  if (req.method === "HEAD") return;
  const accept = String(req.headers["accept-encoding"] || "");
  if (!/\bgzip\b/i.test(accept)) return;
  if (res.getHeader("content-encoding")) return;

  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, ...rest) => {
    const headers = rest[0] && typeof rest[0] === "object" && !Array.isArray(rest[0]) ? rest[0] : {};
    const contentType = headers["content-type"] || headers["Content-Type"] || res.getHeader("content-type") || "";
    const alreadyEncoded = headers["content-encoding"] || headers["Content-Encoding"] || res.getHeader("content-encoding");
    const isCompressible =
      !alreadyEncoded &&
      COMPRESSIBLE_RE.test(String(contentType)) &&
      !/text\/event-stream/i.test(String(contentType));
    if (isCompressible && status !== 204 && status !== 304) {
      delete headers["content-length"];
      res.removeHeader("content-length");
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);
      const gzip = zlib.createGzip({ level: 6 });
      gzip.on("data", (chunk) => origWrite(chunk));
      gzip.on("end", () => origEnd());
      gzip.on("error", () => { /* best-effort: abort compressed stream */ });
      res.write = (chunk, enc, cb) => {
        if (chunk) gzip.write(chunk, enc, cb);
        return res;
      };
      res.end = (chunk, enc, cb) => {
        if (chunk) gzip.write(chunk, enc, () => gzip.end());
        else gzip.end();
        if (cb) res.once("finish", cb);
        return res;
      };
      res.writeHead = origWriteHead;
      return origWriteHead(status, rest[0] ? { ...headers, "content-encoding": "gzip" } : undefined, ...rest.slice(1));
    }
    res.writeHead = origWriteHead;
    return origWriteHead(status, ...rest);
  };
}

// Per-process secret proving x-9r-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes. Named like x-9r-cli-token
// so the request-detail header sanitizer redacts it too.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;

let quotaCacheStarted = false;

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

function startQuotaCacheFromCustomServer() {
  if (quotaCacheStarted) return;
  quotaCacheStarted = true;
  const modPath = path.join(__dirname, "src", "domain", "quotaCache.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundRefresh();
      } catch (e) {
        console.error("[QuotaCache] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundRefresh();
        } catch {}
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      if (process.env.DEBUG_QUOTA_CACHE) {
        console.error("[QuotaCache] import failed:", e && e.message ? e.message : e);
      }
    });
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
    const proxyIp = xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-9r-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-9r-via-proxy"];
    delete req.headers["x-9r-peer-token"];
    req.headers["x-9r-real-ip"] = ip;
    req.headers["x-9r-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-9r-via-proxy"] = "1";
    wrapCompression(req, res);
    return handler(req, res);
  };
  const server = origCreate(...rest, wrapped);
  server.once("listening", () => {
    startQuotaCacheFromCustomServer();
  });
  const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    // Cap buffered body: an unauthenticated upgrade with a giant
    // content-length would buffer until OOM.
    const H2C_MAX_BODY = 32 * 1024 * 1024;
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > H2C_MAX_BODY) {
      socket.destroy();
      return true;
    }
    const chunks = [head];
    let received = head.length;
    const serve = () => {
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      // Slowloris guard: an upgrade that stalls mid-body must not hold a
      // socket (and its buffered chunks) open forever.
      socket.setTimeout(30000, () => socket.destroy());
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.setTimeout(0);
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const standalone = path.join(__dirname, "server.js");
  if (fs.existsSync(standalone)) {
    require(standalone);
  } else {
    // Repo checkout has no standalone build next to us. `next start` builds its HTTP
    // server in-process, so the wrapper above still sanitizes every request.
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
