import { getAdapter } from "../driver.js";
import { stringifyJson } from "../helpers/jsonCol.js";

function jsonValue(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function snapshotFromRow(row) {
  if (!row) return null;
  return {
    connectionId: row.connection_id,
    provider: row.provider,
    plan: row.plan,
    quotas: row.quotas ?? {},
    rateLimits: row.rate_limits ?? null,
    remainingPct: row.remaining_pct === null || row.remaining_pct === undefined
      ? null
      : Number(row.remaining_pct),
    rawDosage: row.raw_dosage === null || row.raw_dosage === undefined
      ? null
      : Number(row.raw_dosage),
    resetAt: row.reset_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertUsageSnapshot({
  connectionId,
  provider,
  plan = null,
  quotas = {},
  rateLimits = null,
  remainingPct = null,
  rawDosage = null,
  resetAt = null,
}) {
  if (!connectionId) throw new Error("connectionId is required");
  if (!provider) throw new Error("provider is required");

  const db = await getAdapter();
  const row = await db.get(
    `INSERT INTO usage_snapshots
       (connection_id, provider, plan, quotas, rate_limits, remaining_pct, raw_dosage, reset_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       plan = EXCLUDED.plan,
       quotas = EXCLUDED.quotas,
       rate_limits = EXCLUDED.rate_limits,
       remaining_pct = EXCLUDED.remaining_pct,
       raw_dosage = EXCLUDED.raw_dosage,
       reset_at = EXCLUDED.reset_at,
       updated_at = NOW()
     RETURNING *`,
    [
      connectionId,
      provider,
      plan,
      stringifyJson(jsonValue(quotas, {})),
      stringifyJson(jsonValue(rateLimits, null)),
      remainingPct,
      rawDosage,
      resetAt,
    ],
  );
  return snapshotFromRow(row);
}

export async function getUsageSnapshotByConnectionId(connectionId) {
  if (!connectionId) return null;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT * FROM usage_snapshots WHERE connection_id = $1`,
    [connectionId],
  );
  return snapshotFromRow(row);
}

export async function getUsageSnapshotsByProvider(provider) {
  if (!provider) return [];
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT * FROM usage_snapshots WHERE provider = $1
     ORDER BY remaining_pct ASC NULLS LAST, updated_at DESC`,
    [provider],
  );
  return rows.map(snapshotFromRow);
}

export async function getBatchProviderQuotas(provider) {
  if (!provider) return [];
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT
       s.connection_id,
       s.provider,
       s.plan,
       s.quotas,
       s.rate_limits,
       s.remaining_pct,
       s.raw_dosage,
       s.reset_at,
       s.updated_at,
       c.name,
       c.email,
       c.priority,
       c.is_active,
       c.locked_all_until
     FROM usage_snapshots AS s
     INNER JOIN provider_connections AS c ON c.id = s.connection_id
     WHERE s.provider = $1
     ORDER BY s.remaining_pct ASC NULLS LAST, c.priority ASC NULLS LAST, s.updated_at DESC`,
    [provider],
  );

  return rows.map((row) => ({
    ...snapshotFromRow(row),
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.is_active === true || row.is_active === 1,
    lockedAllUntil: row.locked_all_until,
  }));
}
