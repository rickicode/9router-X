export const PG_SCHEMA_SQL = `
-- Metadata Schema Versioning
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Provider Connections
CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  auth_type VARCHAR(32) NOT NULL,
  name TEXT,
  email TEXT,
  priority INTEGER DEFAULT 999,
  is_active BOOLEAN DEFAULT TRUE,
  test_status VARCHAR(32) DEFAULT 'active',
  locked_all_until TIMESTAMPTZ,
  rate_limited_until TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  model_locks JSONB DEFAULT '{}'::jsonb,
  last_error TEXT,
  error_code TEXT,
  last_error_at TIMESTAMPTZ,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_routing ON provider_connections (provider, priority, last_used_at NULLS FIRST)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pc_model_locks ON provider_connections USING GIN (model_locks);
CREATE INDEX IF NOT EXISTS idx_pc_token_refresh ON provider_connections (provider, token_expires_at)
WHERE is_active = true AND token_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON provider_connections (provider, is_active);

-- Provider Nodes
CREATE TABLE IF NOT EXISTS provider_nodes (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quota & Usage Snapshots
CREATE TABLE IF NOT EXISTS usage_snapshots (
  connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  plan TEXT,
  quotas JSONB NOT NULL,
  rate_limits JSONB,
  remaining_pct NUMERIC,
  raw_dosage NUMERIC,
  reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_snap_provider ON usage_snapshots (provider);
CREATE INDEX IF NOT EXISTS idx_usage_snap_reset ON usage_snapshots (reset_at);

-- Proxy Pools
CREATE TABLE IF NOT EXISTS proxy_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  proxy_url TEXT NOT NULL,
  no_proxy TEXT DEFAULT '',
  type VARCHAR(32) DEFAULT 'http',
  "group" VARCHAR(64) DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  strict_proxy BOOLEAN DEFAULT FALSE,
  test_status VARCHAR(32) DEFAULT 'unknown',
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_group ON proxy_pools ("group") WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pp_active ON proxy_pools (is_active);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  machine_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ak_key ON api_keys (key);

-- Combos
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT,
  models JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_combos_name ON combos (name);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KV Store
CREATE TABLE IF NOT EXISTS kv (
  scope VARCHAR(64) NOT NULL,
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv (scope);

-- Partitioned Request Details
CREATE TABLE IF NOT EXISTS request_details (
  id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  status VARCHAR(32),
  data JSONB NOT NULL,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Partitioned Usage History
CREATE TABLE IF NOT EXISTS usage_history (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  api_key TEXT,
  endpoint TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  status VARCHAR(32),
  tokens JSONB,
  meta JSONB,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Daily Usage Aggregates
CREATE TABLE IF NOT EXISTS usage_daily (
  date_key DATE PRIMARY KEY,
  data JSONB NOT NULL
);
`;

/**
 * Ensure monthly partitions exist for current and next month
 */
export async function ensureMonthlyPartitions(adapter) {
  const dates = [];
  const now = new Date();
  dates.push(new Date(now.getFullYear(), now.getMonth(), 1));
  dates.push(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  dates.push(new Date(now.getFullYear(), now.getMonth() + 2, 1));

  for (let i = 0; i < dates.length - 1; i++) {
    const start = dates[i];
    const end = dates[i + 1];
    const suffix = `y${start.getFullYear()}m${String(start.getMonth() + 1).padStart(2, "0")}`;
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;

    const rdSql = `CREATE TABLE IF NOT EXISTS request_details_${suffix} PARTITION OF request_details FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;
    const uhSql = `CREATE TABLE IF NOT EXISTS usage_history_${suffix} PARTITION OF usage_history FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;

    await adapter.exec(rdSql);
    await adapter.exec(uhSql);

    // Performance indexes per partition for high-speed dashboard analytics
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_ts ON request_details_${suffix} (timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_prov ON request_details_${suffix} (provider, timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_lookup ON usage_history_${suffix} (timestamp, provider, model);`);
  }
}
