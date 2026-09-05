import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

const DEFAULT_MAX_RECORDS = 200;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_JSON_SIZE = 5 * 1024;
const CONFIG_CACHE_TTL_MS = 5000;

let cachedConfig = null;
let cachedConfigTs = 0;
let writeBuffer = [];
let flushTimer = null;
let isFlushing = false;

function normalizeJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  return typeof value === "string" ? parseJson(value, fallback) : value;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !sensitiveKeys.some((s) => key.toLowerCase().includes(s))),
  );
}

export const __test__ = { sanitizeHeaders };

function truncateField(value, maxSize) {
  if (value === undefined || value === null) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxSize) return value;
  return {
    _truncated: true,
    _originalSize: serialized.length,
    _preview: serialized.slice(0, 200),
  };
}

function generateDetailId(model) {
  const modelPart = model ? String(model).replace(/[^a-zA-Z0-9-]/g, "-") : "unknown";
  return `${new Date().toISOString()}-${randomUUID()}-${modelPart}`;
}

function rowToDetail(row) {
  if (!row) return null;
  return normalizeJson(row.data, {});
}

async function getObservabilityConfig() {
  if (cachedConfig && Date.now() - cachedConfigTs < CONFIG_CACHE_TTL_MS) return cachedConfig;

  try {
    const { getSettings } = await import("./settingsRepo.js");
    const settings = await getSettings();
    const envRequestLogs = process.env.ENABLE_REQUEST_LOGS;
    const enabled = envRequestLogs !== undefined
      ? envRequestLogs.toLowerCase() === "true"
      : settings.enableObservability !== false && process.env.OBSERVABILITY_ENABLED !== "false";
    cachedConfig = {
      enabled,
      maxRecords: Number(settings.observabilityMaxRecords || process.env.OBSERVABILITY_MAX_RECORDS || DEFAULT_MAX_RECORDS),
      batchSize: Number(settings.observabilityBatchSize || process.env.OBSERVABILITY_BATCH_SIZE || DEFAULT_BATCH_SIZE),
      flushIntervalMs: Number(settings.observabilityFlushIntervalMs || process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || DEFAULT_FLUSH_INTERVAL_MS),
      maxJsonSize: Number(settings.observabilityMaxJsonSize || process.env.OBSERVABILITY_MAX_JSON_SIZE || 5) * 1024,
    };
  } catch {
    cachedConfig = {
      enabled: false,
      maxRecords: DEFAULT_MAX_RECORDS,
      batchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      maxJsonSize: DEFAULT_MAX_JSON_SIZE,
    };
  }
  cachedConfigTs = Date.now();
  return cachedConfig;
}

async function flushToDatabase() {
  if (isFlushing || writeBuffer.length === 0) return;
  isFlushing = true;
  try {
    while (writeBuffer.length > 0) {
      const items = writeBuffer.splice(0, writeBuffer.length);
      const db = await getAdapter();
      const config = await getObservabilityConfig();

      await db.transaction(async (tx) => {
        for (const item of items) {
          const detail = { ...item };
          detail.id ||= generateDetailId(detail.model);
          detail.timestamp ||= new Date().toISOString();
          if (detail.request?.headers) {
            detail.request = { ...detail.request, headers: sanitizeHeaders(detail.request.headers) };
          }

          const record = {
            ...detail,
            provider: detail.provider || null,
            model: detail.model || null,
            connectionId: detail.connectionId || null,
            status: detail.status || null,
            latency: detail.latency || {},
            tokens: detail.tokens || {},
            request: truncateField(detail.request, config.maxJsonSize),
            providerRequest: truncateField(detail.providerRequest, config.maxJsonSize),
            providerResponse: truncateField(detail.providerResponse, config.maxJsonSize),
            response: truncateField(detail.response, config.maxJsonSize),
            pxpipe: detail.pxpipe,
          };

          await tx.run(
            `INSERT INTO request_details (id, timestamp, provider, model, connection_id, status, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (id, timestamp) DO UPDATE SET
               provider = EXCLUDED.provider,
               model = EXCLUDED.model,
               connection_id = EXCLUDED.connection_id,
               status = EXCLUDED.status,
               data = EXCLUDED.data`,
            [
              record.id,
              record.timestamp,
              record.provider,
              record.model,
              record.connectionId,
              record.status,
              JSON.stringify(record),
            ],
          );
        }

        // Fast partition-pruned cleanup: find timestamp cutoff instead of unindexed composite IN subquery
        const countRow = await tx.get(`SELECT COUNT(*)::int AS total FROM request_details`);
        const excess = (countRow?.total || 0) - config.maxRecords;
        if (excess > 0) {
          const cutoffRow = await tx.get(
            `SELECT timestamp FROM request_details ORDER BY timestamp ASC OFFSET $1 LIMIT 1`,
            [excess],
          );
          if (cutoffRow?.timestamp) {
            await tx.run(`DELETE FROM request_details WHERE timestamp < $1`, [cutoffRow.timestamp]);
          }
        }
      });
    }
  } catch (error) {
    console.error("[requestDetailsRepo] Batch write failed:", error);
  } finally {
    isFlushing = false;
  }
}

export async function saveRequestDetail(detail) {
  const config = await getObservabilityConfig();
  if (!config.enabled || !detail || typeof detail !== "object") return;

  writeBuffer.push(detail);
  if (writeBuffer.length >= config.batchSize) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    await flushToDatabase();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToDatabase().catch((error) => console.error("[requestDetailsRepo] flush failed:", error));
    }, config.flushIntervalMs);
    flushTimer.unref?.();
  }
}

export async function getRequestDetails(filter = {}) {
  const db = await getAdapter();
  const conditions = [];
  const params = [];
  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filter.provider) add("provider = ?", filter.provider);
  if (filter.model) add("model = ?", filter.model);
  if (filter.connectionId) add("connection_id = ?", filter.connectionId);
  if (filter.status) add("status = ?", filter.status);
  if (filter.startDate) add("timestamp >= ?", new Date(filter.startDate).toISOString());
  if (filter.endDate) add("timestamp <= ?", new Date(filter.endDate).toISOString());

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await db.get(`SELECT COUNT(*)::int AS count FROM request_details ${where}`, params);
  const totalItems = count?.count || 0;
  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const rows = await db.all(
    `SELECT data FROM request_details ${where} ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );

  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    details: rows.map(rowToDetail),
    pagination: { page, pageSize, totalItems, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getRequestDetailById(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT data FROM request_details WHERE id = $1 ORDER BY timestamp DESC LIMIT 1`,
    [id],
  );
  return rowToDetail(row);
}

export async function getDistinctProviders() {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT DISTINCT provider FROM request_details WHERE provider IS NOT NULL ORDER BY provider ASC`,
  );
  return rows.map((row) => row.provider);
}

async function flushOnShutdown() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  await flushToDatabase();
}

process.once("beforeExit", flushOnShutdown);
process.once("SIGINT", () => { flushOnShutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { flushOnShutdown().finally(() => process.exit(0)); });
