import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { invalidateCachedConnections } from "../../redis/client.js";

const MODEL_LOCK_PREFIX = "modelLock_";
const MODEL_LOCK_ALL = "__all";

const CONNECTION_FIELDS = new Set([
  "id",
  "provider",
  "authType",
  "name",
  "email",
  "priority",
  "isActive",
  "testStatus",
  "lockedAllUntil",
  "rateLimitedUntil",
  "tokenExpiresAt",
  "lastUsedAt",
  "modelLocks",
  "lastError",
  "errorCode",
  "lastErrorAt",
  "createdAt",
  "updatedAt",
]);

const CONNECTION_SNAKE_FIELDS = {
  auth_type: "authType",
  is_active: "isActive",
  test_status: "testStatus",
  locked_all_until: "lockedAllUntil",
  rate_limited_until: "rateLimitedUntil",
  token_expires_at: "tokenExpiresAt",
  last_used_at: "lastUsedAt",
  model_locks: "modelLocks",
  last_error: "lastError",
  error_code: "errorCode",
  last_error_at: "lastErrorAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

const DATA_FIELDS_TO_CLEAN = [
  "displayName",
  "email",
  "globalPriority",
  "defaultModel",
  "accessToken",
  "refreshToken",
  "expiresAt",
  "tokenType",
  "scope",
  "projectId",
  "apiKey",
  "testStatus",
  "lastTested",
  "lastError",
  "lastErrorAt",
  "rateLimitedUntil",
  "expiresIn",
  "errorCode",
  "consecutiveUseCount",
  "idToken",
  "lastRefreshAt",
  "backoffLevel",
  "proxyRotationStrategy",
  "proxyPoolIds",
];

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

function modelLocksFromRow(row, rowData) {
  const locks = { ...jsonObject(row.model_locks, {}) };
  const data = jsonObject(rowData, {});

  if (data.modelLocks && typeof data.modelLocks === "object") {
    Object.assign(locks, data.modelLocks);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) {
      const model = key.slice(MODEL_LOCK_PREFIX.length);
      if (value === null || value === undefined) delete locks[model];
      else locks[model] = value;
    }
  }
  return locks;
}

function rowToConnection(row) {
  if (!row) return null;

  const rowData = jsonObject(row.data, {});
  const { modelLocks: _dataModelLocks, ...data } = rowData;
  const modelLocks = modelLocksFromRow(row, rowData);
  const connection = {
    ...data,
    id: row.id,
    provider: row.provider,
    authType: row.auth_type,
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: booleanValue(row.is_active),
    testStatus: row.test_status,
    lockedAllUntil: row.locked_all_until,
    rateLimitedUntil: row.rate_limited_until,
    tokenExpiresAt: row.token_expires_at,
    lastUsedAt: row.last_used_at,
    modelLocks,
    lastError: row.last_error,
    errorCode: row.error_code,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Keep the old flat lock names available to the existing routing/UI code.
  for (const [model, until] of Object.entries(modelLocks)) {
    if (until !== null && until !== undefined) {
      connection[`${MODEL_LOCK_PREFIX}${model}`] = until;
    }
  }
  return connection;
}

function normalizePatch(data = {}) {
  const patch = { ...data };
  for (const [snake, camel] of Object.entries(CONNECTION_SNAKE_FIELDS)) {
    if (patch[camel] === undefined && patch[snake] !== undefined) patch[camel] = patch[snake];
    delete patch[snake];
  }
  return patch;
}

function modelLocksFromConnection(connection, baseLocks = {}) {
  const locks = { ...baseLocks };
  if (connection.modelLocks && typeof connection.modelLocks === "object") {
    Object.assign(locks, connection.modelLocks);
  }
  for (const [key, value] of Object.entries(connection)) {
    if (!key.startsWith(MODEL_LOCK_PREFIX)) continue;
    const model = key.slice(MODEL_LOCK_PREFIX.length);
    if (value === null || value === undefined) delete locks[model];
    else locks[model] = value;
  }
  return locks;
}

function connectionData(connection) {
  const data = { ...connection };
  for (const field of CONNECTION_FIELDS) delete data[field];
  for (const key of Object.keys(data)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) delete data[key];
  }
  return data;
}

function connectionValues(connection, { createdAt } = {}) {
  return {
    id: connection.id,
    provider: connection.provider,
    authType: connection.authType || "oauth",
    name: connection.name ?? null,
    email: connection.email ?? null,
    priority: connection.priority ?? 999,
    isActive: booleanValue(connection.isActive),
    testStatus: connection.testStatus ?? "active",
    lockedAllUntil: connection.lockedAllUntil ?? null,
    rateLimitedUntil: connection.rateLimitedUntil ?? null,
    tokenExpiresAt: connection.tokenExpiresAt ?? null,
    lastUsedAt: connection.lastUsedAt ?? null,
    modelLocks: modelLocksFromConnection(connection),
    lastError: connection.lastError ?? null,
    errorCode: connection.errorCode ?? null,
    lastErrorAt: connection.lastErrorAt ?? null,
    data: connectionData(connection),
    createdAt: createdAt ?? connection.createdAt ?? new Date().toISOString(),
    updatedAt: connection.updatedAt ?? new Date().toISOString(),
  };
}

async function writeConnection(db, connection, options = {}) {
  const values = connectionValues(connection, options);
  const row = await db.get(
    `INSERT INTO provider_connections
       (id, provider, auth_type, name, email, priority, is_active, test_status,
        locked_all_until, rate_limited_until, token_expires_at, last_used_at,
        model_locks, last_error, error_code, last_error_at, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (id) DO UPDATE SET
       provider = EXCLUDED.provider,
       auth_type = EXCLUDED.auth_type,
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       priority = EXCLUDED.priority,
       is_active = EXCLUDED.is_active,
       test_status = EXCLUDED.test_status,
       locked_all_until = EXCLUDED.locked_all_until,
       rate_limited_until = EXCLUDED.rate_limited_until,
       token_expires_at = EXCLUDED.token_expires_at,
       last_used_at = EXCLUDED.last_used_at,
       model_locks = EXCLUDED.model_locks,
       last_error = EXCLUDED.last_error,
       error_code = EXCLUDED.error_code,
       last_error_at = EXCLUDED.last_error_at,
       data = EXCLUDED.data,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      values.id,
      values.provider,
      values.authType,
      values.name,
      values.email,
      values.priority,
      values.isActive,
      values.testStatus,
      values.lockedAllUntil,
      values.rateLimitedUntil,
      values.tokenExpiresAt,
      values.lastUsedAt,
      values.modelLocks,
      values.lastError,
      values.errorCode,
      values.lastErrorAt,
      values.data,
      values.createdAt,
      values.updatedAt,
    ],
  );
  return rowToConnection(row);
}

async function reorderInTransaction(db, provider) {
  const result = await db.run(
    `WITH ranked AS (
       SELECT id,
              ROW_NUMBER() OVER (
                ORDER BY priority ASC NULLS LAST, updated_at DESC NULLS LAST, id ASC
              ) AS new_priority
       FROM provider_connections
       WHERE provider = $1
     )
     UPDATE provider_connections AS pc
     SET priority = ranked.new_priority,
         updated_at = NOW()
     FROM ranked
     WHERE pc.id = ranked.id`,
    [provider],
  );
  return Number(result?.changes ?? 0);
}

function deriveConnectionName(data, fallbackName) {
  if (data.provider === "github") {
    return data.providerSpecificData?.githubLogin
      || data.providerSpecificData?.githubEmail
      || data.email
      || data.providerSpecificData?.githubName
      || fallbackName;
  }
  return fallbackName;
}

const FATAL_CONNECTION_ERROR_SQL = "(last_error ~* '(credits exhausted|insufficient balance|insufficient credits|banned|account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)')";
const CONNECTION_UNAVAILABLE_DATA_SQL = "(COALESCE(data->'providerSpecificData'->>'refreshBlocked', 'false') = 'true')";
const safeTimestampSql = (expression) => `(CASE WHEN (${expression}) IS NOT NULL AND pg_input_is_valid((${expression})::text, 'timestamptz') THEN (${expression})::timestamptz ELSE NULL END)`;
const FUTURE_ACCOUNT_LOCK_SQL = `(
  (locked_all_until IS NOT NULL AND locked_all_until > NOW())
  OR (COALESCE(${safeTimestampSql("model_locks->>'__all'")}, '-infinity'::timestamptz) > NOW())
  OR (rate_limited_until IS NOT NULL AND rate_limited_until > NOW())
)`;
const FUTURE_MODEL_LOCK_SQL = `EXISTS (
  SELECT 1 FROM jsonb_each_text(
    CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END
  ) AS kv(k, v)
  WHERE k <> '__all' AND COALESCE(${safeTimestampSql('kv.v')}, '-infinity'::timestamptz) > NOW()
)`;
const ACTIVE_CONNECTION_SQL = `(
  is_active = true
  AND COALESCE(test_status, 'active') NOT IN ('unavailable', 'error', 'expired', 'invalid')
  AND NOT ${CONNECTION_UNAVAILABLE_DATA_SQL}
  AND (last_error IS NULL OR NOT ${FATAL_CONNECTION_ERROR_SQL})
  AND NOT ${FUTURE_ACCOUNT_LOCK_SQL}
  AND NOT ${FUTURE_MODEL_LOCK_SQL}
)`;
const EXHAUSTED_CONNECTION_SQL = `(
  is_active = true
  AND COALESCE(test_status, 'active') NOT IN ('unavailable', 'error', 'expired', 'invalid')
  AND NOT ${CONNECTION_UNAVAILABLE_DATA_SQL}
  AND (last_error IS NULL OR NOT ${FATAL_CONNECTION_ERROR_SQL})
  AND NOT ${FUTURE_ACCOUNT_LOCK_SQL}
  AND ${FUTURE_MODEL_LOCK_SQL}
)`;
const UNAVAILABLE_CONNECTION_SQL = `(
  is_active = true
  AND (
    ${FUTURE_ACCOUNT_LOCK_SQL}
    OR COALESCE(test_status, 'active') IN ('unavailable', 'error', 'expired', 'invalid')
    OR ${CONNECTION_UNAVAILABLE_DATA_SQL}
    OR ${FATAL_CONNECTION_ERROR_SQL}
  )
)`;
const ROUTABLE_CONNECTION_SQL = `(
  is_active = true
  AND COALESCE(test_status, 'active') NOT IN ('unavailable', 'error', 'expired', 'invalid')
  AND NOT ${CONNECTION_UNAVAILABLE_DATA_SQL}
  AND (last_error IS NULL OR NOT ${FATAL_CONNECTION_ERROR_SQL})
  AND NOT ${FUTURE_ACCOUNT_LOCK_SQL}
)`;

function buildConnectionFilterConditions(filter, params) {
  const where = [];
  if (filter.provider) {
    params.push(filter.provider);
    where.push(`provider = $${params.length}`);
  }
  if (filter.providers && Array.isArray(filter.providers) && filter.providers.length > 0) {
    params.push(filter.providers);
    where.push(`provider = ANY($${params.length})`);
  }
  if (filter.authType) {
    params.push(filter.authType);
    where.push(`auth_type = $${params.length}`);
  }
  if (filter.isActive !== undefined) {
    params.push(filter.isActive);
    where.push(`is_active = $${params.length}`);
  }
  if (filter.search && typeof filter.search === "string" && filter.search.trim()) {
    params.push(`%${filter.search.trim()}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (filter.status) {
    if (filter.status === "active") {
      where.push(ACTIVE_CONNECTION_SQL);
    } else if (filter.status === "exhausted") {
      where.push(EXHAUSTED_CONNECTION_SQL);
    } else if (filter.status === "unavailable") {
      where.push(UNAVAILABLE_CONNECTION_SQL);
    } else if (filter.status === "disabled") {
      where.push(`is_active = false`);
    }
  }
  return where;
}

export async function getProviderConnections(filter = {}) {
  const db = await getAdapter();
  const params = [];
  const where = buildConnectionFilterConditions(filter, params);

  let limitClause = "";
  if (filter.limit) {
    params.push(Math.max(1, Number(filter.limit)));
    limitClause = ` LIMIT $${params.length}`;
    if (filter.offset) {
      params.push(Math.max(0, Number(filter.offset)));
      limitClause += ` OFFSET $${params.length}`;
    }
  }

  const distinctClause = filter.distinctByProvider ? "DISTINCT ON (provider)" : "";
  const orderClause = filter.distinctByProvider
    ? "ORDER BY provider, priority ASC NULLS LAST, updated_at DESC NULLS LAST"
    : "ORDER BY priority ASC NULLS LAST, updated_at DESC NULLS LAST";

  const rows = await db.all(
    `SELECT ${distinctClause} id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, token_expires_at, last_used_at,
            model_locks, last_error, error_code, last_error_at, data, created_at, updated_at
       FROM provider_connections
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${orderClause}
      ${limitClause}`,
    params,
  );
  return rows.map(rowToConnection);
}

export async function countProviderConnections(filter = {}) {
  const db = await getAdapter();
  const params = [];
  const where = buildConnectionFilterConditions(filter, params);

  const row = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  return Number(row?.count || 0);
}

export async function getProviderConnectionById(id) {
  const db = await getAdapter();
  const row = await db.get(
    `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, token_expires_at, last_used_at,
            model_locks, last_error, error_code, last_error_at, data, created_at, updated_at
       FROM provider_connections
      WHERE id = $1`,
    [id],
  );
  return rowToConnection(row);
}

export async function getProviderSummaryStats() {
  const db = await getAdapter();
  const rows = await db.all(`
    SELECT
      provider,
      auth_type,
      COUNT(*)::int AS total,
      COUNT(CASE WHEN is_active = false THEN 1 END)::int AS disabled_count,
      COUNT(CASE WHEN ${UNAVAILABLE_CONNECTION_SQL} THEN 1 END)::int AS unavailable_count,
      COUNT(CASE WHEN ${ACTIVE_CONNECTION_SQL} THEN 1 END)::int AS active_count,
      MAX(last_error_at) AS latest_error_at
    FROM provider_connections
    GROUP BY provider, auth_type
  `);

  const stats = {};
  for (const r of rows) {
    const provider = r.provider;
    const authType = r.auth_type;
    stats[provider] ||= {};
    stats[provider][authType] = {
      total: Number(r.total || 0),
      connected: Number(r.active_count || 0),
      error: Number(r.unavailable_count || 0),
      allDisabled: Number(r.total || 0) > 0 && Number(r.disabled_count || 0) === Number(r.total || 0),
      lastErrorAt: r.latest_error_at || null,
    };
  }
  return stats;
}

export async function getProxyPoolBoundCounts() {
  const db = await getAdapter();
  const rows = await db.all(`
    SELECT data->'providerSpecificData'->>'proxyPoolId' AS pool_id,
           COUNT(*)::int AS count
      FROM provider_connections
     WHERE data->'providerSpecificData'->>'proxyPoolId' IS NOT NULL
     GROUP BY 1
  `);
  const map = {};
  for (const r of rows) {
    if (r.pool_id) map[r.pool_id] = Number(r.count || 0);
  }
  return map;
}

export async function countProxyPoolBoundConnections(proxyPoolId) {
  if (!proxyPoolId) return 0;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      WHERE data->'providerSpecificData'->>'proxyPoolId' = $1`,
    [proxyPoolId],
  );
  return Number(row?.count || 0);
}

export async function getUnavailableOrLockedConnections() {
  const db = await getAdapter();
  const rows = await db.all(`
    SELECT id, provider, name, email, test_status, last_error, model_locks, locked_all_until
      FROM provider_connections
     WHERE ${UNAVAILABLE_CONNECTION_SQL}
        OR EXISTS (
          SELECT 1 FROM jsonb_each_text(
            CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END
          ) AS kv(k, v)
          WHERE ${safeTimestampSql('kv.v')} > NOW()
        )
  `);
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    name: row.name,
    email: row.email,
    testStatus: row.test_status,
    lastError: row.last_error,
    modelLocks: jsonObject(row.model_locks, {}),
    lockedAllUntil: row.locked_all_until,
  }));
}

export async function getClientUsageConnections({
  provider = "all",
  accountStatus = "all",
  sort = "priority",
  limit = 20,
  offset = 0,
  supportedProviders = [],
  apiKeyProviders = [],
}) {
  const db = await getAdapter();
  const where = [];
  const params = [];

  // Eligibility condition
  params.push(supportedProviders);
  const suppIdx = params.length;
  params.push(apiKeyProviders);
  const apiIdx = params.length;
  where.push(`(provider = ANY($${suppIdx}) AND (auth_type = 'oauth' OR provider = ANY($${apiIdx})))`);

  if (provider && provider !== "all") {
    params.push(provider);
    where.push(`provider = $${params.length}`);
  }

  if (accountStatus === "active") {
    where.push(`is_active = true`);
  } else if (accountStatus === "inactive") {
    where.push(`is_active = false`);
  }

  let orderClause = `ORDER BY priority ASC NULLS LAST, provider ASC, updated_at DESC NULLS LAST`;
  if (sort === "provider") {
    orderClause = `ORDER BY provider ASC, priority ASC NULLS LAST, updated_at DESC NULLS LAST`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Count filtered
  const countRow = await db.get(
    `SELECT COUNT(*)::int AS count FROM provider_connections ${whereSql}`,
    params,
  );
  const total = Number(countRow?.count || 0);

  // Get paged rows
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rows = await db.all(
    `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, token_expires_at, last_used_at,
            model_locks, last_error, error_code, last_error_at, data, created_at, updated_at
       FROM provider_connections
      ${whereSql}
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  return {
    total,
    connections: rows.map(rowToConnection),
  };
}

export async function getClientUsageMeta({ supportedProviders = [], apiKeyProviders = [] }) {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT DISTINCT provider
       FROM provider_connections
      WHERE (provider = ANY($1) AND (auth_type = 'oauth' OR provider = ANY($2)))
      ORDER BY provider ASC`,
    [supportedProviders, apiKeyProviders],
  );
  const countRow = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      WHERE (provider = ANY($1) AND (auth_type = 'oauth' OR provider = ANY($2)))`,
    [supportedProviders, apiKeyProviders],
  );
  return {
    providers: rows.map((r) => r.provider),
    eligibleCount: Number(countRow?.count || 0),
  };
}

export async function getAvailableAccountsForRouting({ provider, model, limit = 5 }) {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT id, provider, auth_type, name, priority, last_used_at, model_locks, data
       FROM provider_connections
      WHERE provider = $1 AND ${ROUTABLE_CONNECTION_SQL}
        AND (
          model_locks->>$2 IS NULL
          OR ${safeTimestampSql('model_locks->>$2')} IS NULL
          OR ${safeTimestampSql('model_locks->>$2')} <= NOW()
        )
      ORDER BY priority ASC, last_used_at ASC NULLS FIRST
      LIMIT $3`,
    [provider, model, limit],
  );
  return rows.map(rowToConnection);
}

export async function touchAccountLastUsed(id) {
  const db = await getAdapter();
  const result = await db.run(
    `UPDATE provider_connections SET last_used_at = NOW() WHERE id = $1`,
    [id],
  );
  return Number(result?.changes ?? 0) > 0;
}

export async function setModelCooldown(id, model, untilIso) {
  const db = await getAdapter();
  const row = await db.get(
    `UPDATE provider_connections
        SET model_locks = jsonb_set(COALESCE(model_locks, '{}'::jsonb), ARRAY[$2], to_jsonb($3::text), true),
            updated_at = NOW()
      WHERE id = $1
      RETURNING provider`,
    [id, model, untilIso],
  );
  if (row?.provider) invalidateCachedConnections(row.provider).catch(() => {});
  return Boolean(row);
}

export async function clearModelCooldown(id, model) {
  const db = await getAdapter();
  const row = await db.get(
    `UPDATE provider_connections
        SET model_locks = COALESCE(model_locks, '{}'::jsonb) - $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING provider`,
    [id, model],
  );
  if (row?.provider) invalidateCachedConnections(row.provider).catch(() => {});
  return Boolean(row);
}

export async function createProviderConnection(data = {}) {
  if (!data.provider) throw new Error("provider is required");
  const db = await getAdapter();
  const input = normalizePatch(data);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const rows = await tx.all(
      `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
              locked_all_until, rate_limited_until, token_expires_at, last_used_at,
              model_locks, last_error, error_code, last_error_at, data, created_at, updated_at
         FROM provider_connections WHERE provider = $1`,
      [input.provider],
    );
    const all = rows.map(rowToConnection);

    let existing = null;
    if (input.authType === "oauth" && input.email) {
      const incomingUsername = input.providerSpecificData?.username;
      const incomingWorkspace = input.providerSpecificData?.chatgptAccountId;
      existing = all.find((connection) => {
        if (connection.authType !== "oauth" || connection.email !== input.email) return false;
        if (input.provider === "codex") {
          const currentWorkspace = connection.providerSpecificData?.chatgptAccountId;
          return Boolean(incomingWorkspace && currentWorkspace && incomingWorkspace === currentWorkspace);
        }
        const currentWorkspace = connection.providerSpecificData?.chatgptAccountId;
        if (incomingWorkspace && currentWorkspace) return incomingWorkspace === currentWorkspace;
        if (incomingWorkspace || currentWorkspace) return false;
        const currentUsername = connection.providerSpecificData?.username;
        if (incomingUsername && currentUsername) return incomingUsername === currentUsername;
        if (incomingUsername || currentUsername) return false;
        return true;
      });
    } else if (input.authType === "apikey" && input.name) {
      existing = all.find((connection) => connection.authType === "apikey" && connection.name === input.name);
    }

    if (existing) {
      const merged = {
        ...existing,
        ...input,
        modelLocks: modelLocksFromConnection(input, existing.modelLocks),
        updatedAt: now,
      };
      return writeConnection(tx, merged, { createdAt: existing.createdAt });
    }

    const connection = {
      ...input,
      id: input.id || uuidv4(),
      authType: input.authType || "oauth",
      name: input.name || null,
      email: input.email ?? null,
      priority: input.priority ?? (all.reduce((max, item) => Math.max(max, item.priority || 0), 0) + 1),
      isActive: input.isActive !== undefined ? input.isActive : true,
      testStatus: input.testStatus || "active",
      modelLocks: modelLocksFromConnection(input),
      createdAt: now,
      updatedAt: now,
    };
    if (!connection.name && (connection.authType === "oauth" || connection.authType === "access_token")) {
      connection.name = deriveConnectionName(input, input.email || `Account ${all.length + 1}`);
    }

    await writeConnection(tx, connection);
    await reorderInTransaction(tx, connection.provider);
    const reordered = await tx.get(`SELECT * FROM provider_connections WHERE id = $1`, [connection.id]);
    invalidateCachedConnections(connection.provider).catch(() => {});
    return rowToConnection(reordered);
  });
}

export async function updateProviderConnection(id, data = {}) {
  const db = await getAdapter();
  const patch = normalizePatch(data);

  return db.transaction(async (tx) => {
    const row = await tx.get(`SELECT * FROM provider_connections WHERE id = $1`, [id]);
    if (!row) return null;

    const existing = rowToConnection(row);
    const merged = {
      ...existing,
      ...patch,
      modelLocks: modelLocksFromConnection(patch, existing.modelLocks),
      updatedAt: new Date().toISOString(),
    };
    const updated = await writeConnection(tx, merged, { createdAt: existing.createdAt });
    invalidateCachedConnections(existing.provider).catch(() => {});
    if (patch.priority !== undefined) {
      await reorderInTransaction(tx, existing.provider);
      return rowToConnection(await tx.get(`SELECT * FROM provider_connections WHERE id = $1`, [id]));
    }
    return updated;
  });
}

export async function setProviderConnectionsActive(provider, authTypes, isActive) {
  const db = await getAdapter();
  const types = Array.isArray(authTypes) ? authTypes : [authTypes];
  const result = await db.run(
    `UPDATE provider_connections
        SET is_active = $1, updated_at = NOW()
      WHERE provider = $2 AND auth_type = ANY($3::text[])`,
    [Boolean(isActive), provider, types],
  );
  invalidateCachedConnections(provider).catch(() => {});
  return Number(result?.changes ?? 0);
}

export async function deleteProviderConnection(id) {
  const db = await getAdapter();
  return db.transaction(async (tx) => {
    const row = await tx.get(`SELECT provider FROM provider_connections WHERE id = $1`, [id]);
    if (!row) return false;
    await tx.run(`DELETE FROM provider_connections WHERE id = $1`, [id]);
    await reorderInTransaction(tx, row.provider);
    invalidateCachedConnections(row.provider).catch(() => {});
    return true;
  });
}

export async function deleteProviderConnectionsByProvider(provider) {
  const db = await getAdapter();
  return db.transaction(async (tx) => {
    const result = await db.run(`DELETE FROM provider_connections WHERE provider = $1`, [provider]);
    invalidateCachedConnections(provider).catch(() => {});
    return Number(result?.changes ?? 0);
  });
}

export async function reorderProviderConnections(provider) {
  const db = await getAdapter();
  return reorderInTransaction(db, provider);
}

export async function cleanupProviderConnections() {
  const db = await getAdapter();
  return db.transaction(async (tx) => {
    let cleaned = 0;
    const rows = await tx.all(`SELECT id, data, model_locks FROM provider_connections`);

    for (const row of rows) {
      const data = { ...jsonObject(row.data, {}) };
      const modelLocks = { ...jsonObject(row.model_locks, {}) };
      let dirty = false;

      for (const field of DATA_FIELDS_TO_CLEAN) {
        if (Object.prototype.hasOwnProperty.call(data, field) && data[field] == null) {
          delete data[field];
          cleaned += 1;
          dirty = true;
        }
      }
      if (data.modelLocks && typeof data.modelLocks === "object") {
        for (const [model, until] of Object.entries(data.modelLocks)) {
          if (modelLocks[model] === undefined && until != null) modelLocks[model] = until;
        }
        delete data.modelLocks;
        cleaned += 1;
        dirty = true;
      }
      for (const key of Object.keys(data)) {
        if (!key.startsWith(MODEL_LOCK_PREFIX)) continue;
        const model = key.slice(MODEL_LOCK_PREFIX.length) || MODEL_LOCK_ALL;
        if (data[key] != null && modelLocks[model] === undefined) modelLocks[model] = data[key];
        delete data[key];
        cleaned += 1;
        dirty = true;
      }
      if (data.providerSpecificData && Object.keys(data.providerSpecificData).length === 0) {
        delete data.providerSpecificData;
        cleaned += 1;
        dirty = true;
      }

      if (dirty) {
        await tx.run(
          `UPDATE provider_connections
              SET model_locks = $1::jsonb, data = $2::jsonb, updated_at = NOW()
            WHERE id = $3`,
          [jsonString(modelLocks), jsonString(data), row.id],
        );
      }
    }
    return cleaned;
  });
}
