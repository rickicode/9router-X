import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

const POOL_SNAKE_FIELDS = {
  proxy_url: "proxyUrl",
  no_proxy: "noProxy",
  is_active: "isActive",
  strict_proxy: "strictProxy",
  test_status: "testStatus",
  last_tested_at: "lastTestedAt",
  last_error: "lastError",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

function jsonObject(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function jsonString(value) {
  return JSON.stringify(value ?? {});
}

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

function rowToPool(row) {
  if (!row) return null;
  const data = jsonObject(row.data, {});
  return {
    ...data,
    id: row.id,
    name: row.name,
    proxyUrl: row.proxy_url,
    noProxy: row.no_proxy,
    type: row.type,
    group: row.group,
    isActive: booleanValue(row.is_active),
    strictProxy: booleanValue(row.strict_proxy, false),
    testStatus: row.test_status,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function poolData(pool) {
  const data = { ...pool };
  delete data.id;
  delete data.name;
  delete data.proxyUrl;
  delete data.noProxy;
  delete data.type;
  delete data.group;
  delete data.isActive;
  delete data.strictProxy;
  delete data.testStatus;
  delete data.lastTestedAt;
  delete data.lastError;
  delete data.createdAt;
  delete data.updatedAt;
  return data;
}

function normalizePatch(data = {}) {
  const patch = { ...data };
  for (const [snake, camel] of Object.entries(POOL_SNAKE_FIELDS)) {
    if (patch[camel] === undefined && patch[snake] !== undefined) patch[camel] = patch[snake];
    delete patch[snake];
  }
  return patch;
}

function poolValues(pool, { createdAt } = {}) {
  return {
    id: pool.id,
    name: pool.name,
    proxyUrl: pool.proxyUrl,
    noProxy: pool.noProxy ?? "",
    type: pool.type || "http",
    group: typeof pool.group === "string" ? pool.group.trim() : (pool.group || ""),
    isActive: booleanValue(pool.isActive),
    strictProxy: booleanValue(pool.strictProxy, false),
    testStatus: pool.testStatus || "unknown",
    lastTestedAt: pool.lastTestedAt ?? null,
    lastError: pool.lastError ?? null,
    data: poolData(pool),
    createdAt: createdAt ?? pool.createdAt ?? new Date().toISOString(),
    updatedAt: pool.updatedAt ?? new Date().toISOString(),
  };
}

async function writePool(db, pool, options = {}) {
  const values = poolValues(pool, options);
  const row = await db.get(
    `INSERT INTO proxy_pools
       (id, name, proxy_url, no_proxy, type, "group", is_active, strict_proxy,
        test_status, last_tested_at, last_error, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       proxy_url = EXCLUDED.proxy_url,
       no_proxy = EXCLUDED.no_proxy,
       type = EXCLUDED.type,
       "group" = EXCLUDED."group",
       is_active = EXCLUDED.is_active,
       strict_proxy = EXCLUDED.strict_proxy,
       test_status = EXCLUDED.test_status,
       last_tested_at = EXCLUDED.last_tested_at,
       last_error = EXCLUDED.last_error,
       data = EXCLUDED.data,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      values.id,
      values.name,
      values.proxyUrl,
      values.noProxy,
      values.type,
      values.group,
      values.isActive,
      values.strictProxy,
      values.testStatus,
      values.lastTestedAt,
      values.lastError,
      jsonString(values.data),
      values.createdAt,
      values.updatedAt,
    ],
  );
  return rowToPool(row);
}

export async function getProxyPools(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.isActive !== undefined) {
    params.push(filter.isActive);
    where.push(`is_active = $${params.length}`);
  }
  if (filter.testStatus) {
    params.push(filter.testStatus);
    where.push(`test_status = $${params.length}`);
  }
  if (filter.group) {
    params.push(filter.group);
    where.push(`"group" = $${params.length}`);
  }

  const rows = await db.all(
    `SELECT id, name, proxy_url, no_proxy, type, "group", is_active, strict_proxy,
            test_status, last_tested_at, last_error, data, created_at, updated_at
       FROM proxy_pools
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
    params,
  );
  return rows.map(rowToPool);
}

export async function getProxyPoolById(id) {
  const db = await getAdapter();
  const row = await db.get(
    `SELECT id, name, proxy_url, no_proxy, type, "group", is_active, strict_proxy,
            test_status, last_tested_at, last_error, data, created_at, updated_at
       FROM proxy_pools
      WHERE id = $1`,
    [id],
  );
  return rowToPool(row);
}

export async function createProxyPool(data = {}) {
  if (!data.name) throw new Error("name is required");
  if (!data.proxyUrl) throw new Error("proxyUrl is required");
  const db = await getAdapter();
  const input = normalizePatch(data);
  const now = new Date().toISOString();
  const pool = {
    ...input,
    id: input.id || uuidv4(),
    name: input.name,
    proxyUrl: input.proxyUrl,
    noProxy: input.noProxy ?? "",
    type: input.type || "http",
    group: typeof input.group === "string" ? input.group.trim() : (input.group || ""),
    isActive: input.isActive !== undefined ? input.isActive : true,
    strictProxy: input.strictProxy === true,
    testStatus: input.testStatus || "unknown",
    lastTestedAt: input.lastTestedAt ?? null,
    lastError: input.lastError ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return writePool(db, pool);
}

export async function updateProxyPool(id, data = {}) {
  const db = await getAdapter();
  const patch = normalizePatch(data);

  return db.transaction(async (tx) => {
    const row = await tx.get(`SELECT * FROM proxy_pools WHERE id = $1`, [id]);
    if (!row) return null;
    const existing = rowToPool(row);
    const merged = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return writePool(tx, merged, { createdAt: existing.createdAt });
  });
}

export async function deleteProxyPool(id) {
  const db = await getAdapter();
  const row = await db.get(`SELECT * FROM proxy_pools WHERE id = $1`, [id]);
  if (!row) return null;
  await db.run(`DELETE FROM proxy_pools WHERE id = $1`, [id]);
  return rowToPool(row);
}