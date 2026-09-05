import { EventEmitter } from "events";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { incrementInFlight, decrementInFlight } from "../../redis/client.js";

function maskApiKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 8) return key.charAt(0) + "***";
  return key.slice(0, 8) + "***";
}

const PENDING_TIMEOUT_MS = 60 * 1000;
const RING_CAP = 50;
const CONN_CACHE_TTL_MS = 30 * 1000;
const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
if (!global._lastErrorProvider) global._lastErrorProvider = { provider: "", ts: 0 };
if (!global._statsEmitter) {
  global._statsEmitter = new EventEmitter();
  global._statsEmitter.setMaxListeners(50);
}
if (!global._pendingTimers) global._pendingTimers = {};
if (!global._recentRing) global._recentRing = { items: [], initialized: false };
if (!global._connectionMapCache) global._connectionMapCache = { map: {}, ts: 0 };
if (!global._statsEmitTimers) global._statsEmitTimers = { pending: null, update: null };

const pendingRequests = global._pendingRequests;
const lastErrorProvider = global._lastErrorProvider;
const pendingTimers = global._pendingTimers;
const recentRing = global._recentRing;
const connCache = global._connectionMapCache;
const statsEmitTimers = global._statsEmitTimers;

export const statsEmitter = global._statsEmitter;

function scheduleStatsEvent(event, delayMs = 150) {
  const key = event === "update" ? "update" : "pending";
  if (statsEmitTimers[key]) return;
  statsEmitTimers[key] = setTimeout(() => {
    statsEmitTimers[key] = null;
    statsEmitter.emit(event);
  }, delayMs);
  statsEmitTimers[key]?.unref?.();
}

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addToCounter(target, key, values) {
  if (!target[key]) target[key] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
  target[key].requests += values.requests || 1;
  target[key].promptTokens += values.promptTokens || 0;
  target[key].completionTokens += values.completionTokens || 0;
  target[key].cachedTokens += values.cachedTokens || 0;
  target[key].cost += values.cost || 0;
  if (values.meta) Object.assign(target[key], values.meta);
}

function aggregateEntryToDay(day, entry) {
  const promptTokens = entry.tokens?.prompt_tokens || entry.tokens?.input_tokens || 0;
  const completionTokens = entry.tokens?.completion_tokens || entry.tokens?.output_tokens || 0;
  const cachedTokens = entry.tokens?.cached_tokens || entry.tokens?.cache_read_input_tokens || 0;
  const cost = entry.cost || 0;
  const vals = { promptTokens, completionTokens, cachedTokens, cost };

  day.requests = (day.requests || 0) + 1;
  day.promptTokens = (day.promptTokens || 0) + promptTokens;
  day.completionTokens = (day.completionTokens || 0) + completionTokens;
  day.cachedTokens = (day.cachedTokens || 0) + cachedTokens;
  day.cost = (day.cost || 0) + cost;

  day.byProvider ||= {};
  day.byModel ||= {};
  day.byAccount ||= {};
  day.byApiKey ||= {};
  day.byEndpoint ||= {};

  if (entry.provider) addToCounter(day.byProvider, entry.provider, vals);

  const modelKey = entry.provider ? `${entry.model}|${entry.provider}` : entry.model;
  addToCounter(day.byModel, modelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });

  if (entry.connectionId) {
    addToCounter(day.byAccount, entry.connectionId, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });
  }

  const apiKeyMasked = maskApiKey(entry.apiKey) || "local-no-key";
  const akModelKey = `${apiKeyMasked}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byApiKey, akModelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider, apiKeyMasked } });

  const endpoint = entry.endpoint || "Unknown";
  const epKey = `${endpoint}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byEndpoint, epKey, { ...vals, meta: { endpoint, rawModel: entry.model, provider: entry.provider } });
}

function pushToRing(entry) {
  recentRing.items.push(entry);
  if (recentRing.items.length > RING_CAP) {
    recentRing.items = recentRing.items.slice(-RING_CAP);
  }
}

async function getConnectionMapCached() {
  if (Date.now() - connCache.ts < CONN_CACHE_TTL_MS) return connCache.map;
  try {
    const db = await getAdapter();
    const rows = await db.all(
      `SELECT id, name, email FROM provider_connections`
    );
    const map = {};
    for (const r of rows) map[r.id] = r.name || r.email || r.id;
    connCache.map = map;
    connCache.ts = Date.now();
  } catch {}
  return connCache.map;
}

async function ensureRingInitialized() {
  if (recentRing.initialized) return;
  recentRing.initialized = true;
  try {
    const db = await getAdapter();
    const rows = await db.all(
      `SELECT timestamp, provider, model, connection_id, api_key, endpoint, cost, status, tokens
       FROM usage_history ORDER BY id DESC LIMIT $1`,
      [RING_CAP],
    );
    recentRing.items = rows.reverse().map((row) => ({
      timestamp: row.timestamp,
      provider: row.provider,
      model: row.model,
      connectionId: row.connection_id,
      apiKey: row.api_key,
      endpoint: row.endpoint,
      cost: row.cost,
      status: row.status,
      tokens: row.tokens ?? {},
    }));
  } catch {}
}

async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;
  try {
    const { getPricingForModel } = await import("./pricingRepo.js");
    const pricing = await getPricingForModel(provider, model);
    if (!pricing) return 0;
    const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
    return calculateCostFromTokens(tokens, pricing);
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

export async function trackPendingRequest(model, provider, connectionId, started, error = false) {
  const modelKey = provider ? `${model} (${provider})` : model;
  const timerKey = `${connectionId}|${modelKey}`;

  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));
  if (pendingRequests.byModel[modelKey] === 0) delete pendingRequests.byModel[modelKey];

  if (connectionId) {
    if (!pendingRequests.byAccount[connectionId]) pendingRequests.byAccount[connectionId] = {};
    if (!pendingRequests.byAccount[connectionId][modelKey]) pendingRequests.byAccount[connectionId][modelKey] = 0;
    pendingRequests.byAccount[connectionId][modelKey] = Math.max(0, pendingRequests.byAccount[connectionId][modelKey] + (started ? 1 : -1));
    if (pendingRequests.byAccount[connectionId][modelKey] === 0) {
      delete pendingRequests.byAccount[connectionId][modelKey];
      if (Object.keys(pendingRequests.byAccount[connectionId]).length === 0) {
        delete pendingRequests.byAccount[connectionId];
      }
    }

    // In-flight concurrency tracker in Redis
    if (started) {
      incrementInFlight(connectionId).catch(() => {});
    } else {
      decrementInFlight(connectionId).catch(() => {});
    }
  }

  if (started) {
    clearTimeout(pendingTimers[timerKey]);
    pendingTimers[timerKey] = setTimeout(() => {
      delete pendingTimers[timerKey];
      if (pendingRequests.byModel[modelKey] > 0) pendingRequests.byModel[modelKey] = 0;
      if (connectionId && pendingRequests.byAccount[connectionId]?.[modelKey] > 0) {
        pendingRequests.byAccount[connectionId][modelKey] = 0;
      }
      scheduleStatsEvent("pending");
    }, PENDING_TIMEOUT_MS);
  } else {
    clearTimeout(pendingTimers[timerKey]);
    delete pendingTimers[timerKey];
  }

  if (!started && error && provider) {
    lastErrorProvider.provider = provider.toLowerCase();
    lastErrorProvider.ts = Date.now();
  }

  scheduleStatsEvent("pending");
}

export async function getActiveRequests() {
  const activeRequests = [];
  const connectionMap = await getConnectionMapCached();

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        activeRequests.push({
          model: match ? match[1] : modelKey,
          provider: match ? match[2] : "unknown",
          account: accountName,
          count,
        });
      }
    }
  }

  await ensureRingInitialized();
  const seen = new Set();
  const recentRequests = [...recentRing.items]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((entry) => {
      const rawTokens = entry.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const ts = entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp || "");
      return {
        timestamp: ts,
        model: entry.model,
        provider: entry.provider || "",
        promptTokens: tokens.prompt_tokens || tokens.input_tokens || 0,
        completionTokens: tokens.completion_tokens || tokens.output_tokens || 0,
        status: entry.status || "ok",
      };
    })
    .filter((entry) => {
      if (entry.promptTokens === 0 && entry.completionTokens === 0) return false;
      const minute = entry.timestamp ? entry.timestamp.slice(0, 16) : "";
      const key = `${entry.model}|${entry.provider}|${entry.promptTokens}|${entry.completionTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const errorProvider = (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "";
  return { activeRequests, recentRequests, errorProvider };
}

export async function saveRequestUsage(entry) {
  try {
    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    const tokens = entry.tokens || {};
    const promptTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
    const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;
    const cost = entry.cost ?? await calculateCost(entry.provider, entry.model, tokens);

    const db = await getAdapter();
    let inserted = false;
    await db.transaction(async (tx) => {
      const existing = await tx.get(
        `SELECT id, endpoint FROM usage_history
         WHERE timestamp = $1
           AND COALESCE(provider, '') = COALESCE($2, '')
           AND COALESCE(model, '') = COALESCE($3, '')
           AND COALESCE(connection_id, '') = COALESCE($4, '')
           AND COALESCE(api_key, '') = COALESCE($5, '')
           AND prompt_tokens = $6
           AND completion_tokens = $7
         ORDER BY id DESC LIMIT 1`,
        [
          entry.timestamp,
          entry.provider || null,
          entry.model || null,
          entry.connectionId || null,
          entry.apiKey || null,
          promptTokens,
          completionTokens,
        ],
      );

      if (existing) {
        if (!existing.endpoint && entry.endpoint) {
          await tx.run(`UPDATE usage_history SET endpoint = $1 WHERE id = $2`, [entry.endpoint, existing.id]);
        }
        return;
      }

      await tx.run(
        `INSERT INTO usage_history
           (timestamp, provider, model, connection_id, api_key, endpoint, prompt_tokens, completion_tokens, cost, status, tokens, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)`,
        [
          entry.timestamp,
          entry.provider || null,
          entry.model || null,
          entry.connectionId || null,
          entry.apiKey || null,
          entry.endpoint || null,
          promptTokens,
          completionTokens,
          cost || 0,
          entry.status || "ok",
          tokens,
          {},
        ],
      );

      const dateKey = getLocalDateKey(entry.timestamp);
      const row = await tx.get(`SELECT data FROM usage_daily WHERE date_key = $1`, [dateKey]);
      const rawData = row?.data;
      const day = (typeof rawData === "string" ? parseJson(rawData, null) : rawData) ?? {
        requests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
        byProvider: {}, byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {},
      };
      aggregateEntryToDay(day, entry);
      await tx.run(
        `INSERT INTO usage_daily (date_key, data) VALUES ($1, $2)
         ON CONFLICT (date_key) DO UPDATE SET data = EXCLUDED.data`,
        [dateKey, day],
      );

      const current = await tx.get(`SELECT value FROM _meta WHERE key = 'totalRequestsLifetime'`);
      const next = (current ? parseInt(current.value, 10) : 0) + 1;
      await tx.run(
        `INSERT INTO _meta (key, value) VALUES ('totalRequestsLifetime', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(next)],
      );
      inserted = true;
    });

    if (inserted) {
      pushToRing(entry);
      scheduleStatsEvent("update", 250);
    }
  } catch (error) {
    console.error("Failed to save usage stats:", error);
  }
}

export async function getUsageHistory(filter = {}) {
  const db = await getAdapter();
  const conditions = [];
  const params = [];
  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filter.provider) add("provider = ?", filter.provider);
  if (filter.model) add("model = ?", filter.model);
  if (filter.startDate) add("timestamp >= ?", new Date(filter.startDate).toISOString());
  if (filter.endDate) add("timestamp <= ?", new Date(filter.endDate).toISOString());

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.all(
    `SELECT timestamp, provider, model, connection_id, api_key, endpoint, cost, status, tokens
     FROM usage_history ${where} ORDER BY id ASC`,
    params,
  );

  return rows.map((r) => ({
    timestamp: r.timestamp,
    provider: r.provider,
    model: r.model,
    connectionId: r.connection_id,
    // PostgreSQL snake_case equivalent of legacy apiKeyMasked: maskApiKey(r.apiKey).
    apiKeyMasked: maskApiKey(r.api_key),
    endpoint: r.endpoint,
    cost: r.cost,
    status: r.status,
    tokens: r.tokens ?? {},
  }));
}

function buildAggregatesFromDays(dayRows, connectionMap = {}, providerNodeNameMap = {}, apiKeyMap = {}) {
  const stats = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
  };

  for (const dayData of dayRows) {
    stats.totalPromptTokens += Number(dayData.promptTokens || 0);
    stats.totalCompletionTokens += Number(dayData.completionTokens || 0);
    stats.totalCachedTokens += Number(dayData.cachedTokens || 0);
    stats.totalCost += Number(dayData.cost || 0);

    for (const [provider, p] of Object.entries(dayData.byProvider || {})) {
      if (!stats.byProvider[provider]) stats.byProvider[provider] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[provider].requests += Number(p.requests || 0);
      stats.byProvider[provider].promptTokens += Number(p.promptTokens || 0);
      stats.byProvider[provider].completionTokens += Number(p.completionTokens || 0);
      stats.byProvider[provider].cachedTokens += Number(p.cachedTokens || 0);
      stats.byProvider[provider].cost += Number(p.cost || 0);
    }

    for (const [modelKey, m] of Object.entries(dayData.byModel || {})) {
      if (!stats.byModel[modelKey]) stats.byModel[modelKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: m.rawModel, provider: m.provider, lastUsed: dayData.dateKey };
      stats.byModel[modelKey].requests += Number(m.requests || 0);
      stats.byModel[modelKey].promptTokens += Number(m.promptTokens || 0);
      stats.byModel[modelKey].completionTokens += Number(m.completionTokens || 0);
      stats.byModel[modelKey].cachedTokens += Number(m.cachedTokens || 0);
      stats.byModel[modelKey].cost += Number(m.cost || 0);
      if (dayData.dateKey > (stats.byModel[modelKey].lastUsed || "")) stats.byModel[modelKey].lastUsed = dayData.dateKey;
    }

    for (const [accountKey, a] of Object.entries(dayData.byAccount || {})) {
      if (!stats.byAccount[accountKey]) stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: a.rawModel, provider: a.provider, connectionId: a.connectionId, accountName: a.accountName, lastUsed: dayData.dateKey };
      stats.byAccount[accountKey].requests += Number(a.requests || 0);
      stats.byAccount[accountKey].promptTokens += Number(a.promptTokens || 0);
      stats.byAccount[accountKey].completionTokens += Number(a.completionTokens || 0);
      stats.byAccount[accountKey].cachedTokens += Number(a.cachedTokens || 0);
      stats.byAccount[accountKey].cost += Number(a.cost || 0);
      if (dayData.dateKey > (stats.byAccount[accountKey].lastUsed || "")) stats.byAccount[accountKey].lastUsed = dayData.dateKey;
    }

    for (const [apiKeyKey, ak] of Object.entries(dayData.byApiKey || {})) {
      if (!stats.byApiKey[apiKeyKey]) stats.byApiKey[apiKeyKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: ak.rawModel, provider: ak.provider, apiKeyMasked: ak.apiKeyMasked, keyName: ak.keyName, apiKeyKey: ak.apiKeyKey, lastUsed: dayData.dateKey };
      stats.byApiKey[apiKeyKey].requests += Number(ak.requests || 0);
      stats.byApiKey[apiKeyKey].promptTokens += Number(ak.promptTokens || 0);
      stats.byApiKey[apiKeyKey].completionTokens += Number(ak.completionTokens || 0);
      stats.byApiKey[apiKeyKey].cachedTokens += Number(ak.cachedTokens || 0);
      stats.byApiKey[apiKeyKey].cost += Number(ak.cost || 0);
      if (dayData.dateKey > (stats.byApiKey[apiKeyKey].lastUsed || "")) stats.byApiKey[apiKeyKey].lastUsed = dayData.dateKey;
    }

    for (const [endpointKey, ep] of Object.entries(dayData.byEndpoint || {})) {
      if (!stats.byEndpoint[endpointKey]) stats.byEndpoint[endpointKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint: ep.endpoint, rawModel: ep.rawModel, provider: ep.provider, lastUsed: dayData.dateKey };
      stats.byEndpoint[endpointKey].requests += Number(ep.requests || 0);
      stats.byEndpoint[endpointKey].promptTokens += Number(ep.promptTokens || 0);
      stats.byEndpoint[endpointKey].completionTokens += Number(ep.completionTokens || 0);
      stats.byEndpoint[endpointKey].cachedTokens += Number(ep.cachedTokens || 0);
      stats.byEndpoint[endpointKey].cost += Number(ep.cost || 0);
      if (dayData.dateKey > (stats.byEndpoint[endpointKey].lastUsed || "")) stats.byEndpoint[endpointKey].lastUsed = dayData.dateKey;
    }
  }

  const normalizedByProvider = {};
  for (const [provider, value] of Object.entries(stats.byProvider)) {
    normalizedByProvider[provider] = value;
  }
  stats.byProvider = normalizedByProvider;

  const normalizedByModel = {};
  for (const [modelKey, value] of Object.entries(stats.byModel)) {
    const provider = value.provider || modelKey.split("|").slice(1).join("|");
    const rawModel = value.rawModel || modelKey.split("|")[0];
    const displayProvider = providerNodeNameMap[provider] || provider;
    normalizedByModel[`${rawModel} (${provider})`] = {
      ...value,
      rawModel,
      provider: displayProvider,
    };
  }
  stats.byModel = normalizedByModel;

  const normalizedByAccount = {};
  for (const [connectionId, value] of Object.entries(stats.byAccount)) {
    const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
    const provider = value.provider || "unknown";
    const rawModel = value.rawModel || "unknown";
    normalizedByAccount[`${rawModel} (${provider} - ${accountName})`] = {
      ...value,
      rawModel,
      provider: providerNodeNameMap[provider] || provider,
      connectionId,
      accountName,
    };
  }
  stats.byAccount = normalizedByAccount;

  const normalizedByApiKey = {};
  for (const [key, value] of Object.entries(stats.byApiKey)) {
    const [rawApiKey, rawModel, ...providerParts] = key.split("|");
    const provider = value.provider || providerParts.join("|") || "unknown";
    const apiKeyInfo = apiKeyMap[rawApiKey];
    normalizedByApiKey[key] = {
      ...value,
      rawModel: value.rawModel || rawModel,
      provider: providerNodeNameMap[provider] || provider,
      apiKeyMasked: value.apiKeyMasked || (rawApiKey === "local-no-key" ? null : maskApiKey(rawApiKey)),
      keyName: value.keyName || apiKeyInfo?.name || (rawApiKey === "local-no-key" ? "Local (No API Key)" : `${rawApiKey.slice(0, 8)}...`),
      apiKeyKey: value.apiKeyKey || (rawApiKey === "local-no-key" ? rawApiKey : maskApiKey(rawApiKey)),
    };
  }
  stats.byApiKey = normalizedByApiKey;

  const normalizedByEndpoint = {};
  for (const [endpointKey, value] of Object.entries(stats.byEndpoint)) {
    const [endpoint, rawModel, ...providerParts] = endpointKey.split("|");
    const provider = value.provider || providerParts.join("|") || "unknown";
    normalizedByEndpoint[endpointKey] = {
      ...value,
      endpoint: value.endpoint || endpoint,
      rawModel: value.rawModel || rawModel,
      provider: providerNodeNameMap[provider] || provider,
    };
  }
  stats.byEndpoint = normalizedByEndpoint;
  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  return stats;
}

export async function getUsageStats(period = "all") {
  const db = await getAdapter();

  const [{ getApiKeys }, { getProviderNodes }] = await Promise.all([
    import("./apiKeysRepo.js"),
    import("./nodesRepo.js"),
  ]);

  const connectionMap = await getConnectionMapCached();

  const providerNodeNameMap = {};
  try {
    const nodes = await getProviderNodes();
    for (const n of nodes) if (n.id && n.name) providerNodeNameMap[n.id] = n.name;
  } catch {}

  let allApiKeys = [];
  try { allApiKeys = await getApiKeys(); } catch {}
  const apiKeyMap = {};
  for (const k of allApiKeys) apiKeyMap[k.key] = { name: k.name, id: k.id, createdAt: k.createdAt };

  const recentRows = await db.all(
    `SELECT timestamp, provider, model, tokens, status FROM usage_history ORDER BY id DESC LIMIT 100`,
  );
  const seen = new Set();
  const recentRequests = recentRows
    .map((row) => {
      const rawTokens = row.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || "");
      return {
        timestamp: ts,
        model: row.model,
        provider: row.provider || "",
        promptTokens: tokens.prompt_tokens || tokens.input_tokens || 0,
        completionTokens: tokens.completion_tokens || tokens.output_tokens || 0,
        cachedTokens: tokens.cached_tokens || tokens.cache_read_input_tokens || 0,
        status: row.status || "ok",
      };
    })
    .filter((entry) => {
      if (entry.promptTokens === 0 && entry.completionTokens === 0) return false;
      const minute = entry.timestamp ? entry.timestamp.slice(0, 16) : "";
      const key = `${entry.model}|${entry.provider}|${entry.promptTokens}|${entry.completionTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const stats = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
    last10Minutes: [],
    pending: pendingRequests,
    activeRequests: [],
    recentRequests,
    errorProvider: (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "",
  };

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        stats.activeRequests.push({
          model: match ? match[1] : modelKey,
          provider: match ? match[2] : "unknown",
          account: accountName,
          count,
        });
      }
    }
  }

  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);
  const bucketMap = {};
  for (let i = 0; i < 10; i++) {
    const ts = currentMinuteStart.getTime() - (9 - i) * 60 * 1000;
    bucketMap[ts] = { timestamp: ts, requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    stats.last10Minutes.push(bucketMap[ts]);
  }
  const recent10 = await db.all(
    `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history
     WHERE timestamp >= $1 AND timestamp <= $2`,
    [tenMinutesAgo.toISOString(), now.toISOString()],
  );
  for (const row of recent10) {
    const tt = new Date(row.timestamp).getTime();
    const minuteStart = Math.floor(tt / 60000) * 60000;
    if (bucketMap[minuteStart]) {
      bucketMap[minuteStart].requests++;
      bucketMap[minuteStart].promptTokens += row.prompt_tokens || 0;
      bucketMap[minuteStart].completionTokens += row.completion_tokens || 0;
      bucketMap[minuteStart].cost += row.cost || 0;
    }
  }

  const useDailySummary = period !== "24h" && period !== "today";

  if (useDailySummary) {
    const periodDays = { "7d": 7, "30d": 30, "60d": 60 };
    const maxDays = periodDays[period] || null;

    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - maxDays + 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const dayRows = maxDays == null
      ? await db.all(`SELECT date_key, data FROM usage_daily ORDER BY date_key ASC`)
      : await db.all(
          `SELECT date_key, data FROM usage_daily WHERE date_key >= $1 ORDER BY date_key ASC`,
          [cutoffKey],
        );
    const daySummaries = dayRows.map((row) => ({
      dateKey: String(row.date_key).slice(0, 10),
      ...((typeof row.data === "string" ? parseJson(row.data, {}) : row.data) ?? {}),
    }));
    const aggregated = buildAggregatesFromDays(daySummaries, connectionMap, providerNodeNameMap, apiKeyMap);
    Object.assign(stats, aggregated);

    const overlayCutoff = maxDays ? Date.now() - maxDays * 86400000 : 0;
    const histRows = await db.all(
      `SELECT timestamp, provider, model, connection_id, api_key, endpoint
       FROM usage_history WHERE timestamp >= $1`,
      [new Date(overlayCutoff).toISOString()],
    );
    for (const e of histRows) {
      const ts = e.timestamp;
      const modelKey = e.provider ? `${e.model} (${e.provider})` : e.model;
      if (stats.byModel[modelKey] && new Date(ts) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = ts;

      if (e.connection_id) {
        const accountName = connectionMap[e.connection_id] || `Account ${e.connection_id.slice(0, 8)}...`;
        const accountKey = `${e.model} (${e.provider} - ${accountName})`;
        if (stats.byAccount[accountKey] && new Date(ts) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = ts;
      }

      const apiKeyKey = (e.api_key && typeof e.api_key === "string")
        ? `${e.api_key}|${e.model}|${e.provider || "unknown"}`
        : "local-no-key";
      if (stats.byApiKey[apiKeyKey] && new Date(ts) > new Date(stats.byApiKey[apiKeyKey].lastUsed)) stats.byApiKey[apiKeyKey].lastUsed = ts;

      const endpoint = e.endpoint || "Unknown";
      const endpointKey = `${endpoint}|${e.model}|${e.provider || "unknown"}`;
      if (stats.byEndpoint[endpointKey] && new Date(ts) > new Date(stats.byEndpoint[endpointKey].lastUsed)) stats.byEndpoint[endpointKey].lastUsed = ts;
    }
  } else {
    let cutoff;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.toISOString();
    } else {
      cutoff = new Date(Date.now() - PERIOD_MS["24h"]).toISOString();
    }
    const filtered = await db.all(
      `SELECT timestamp, provider, model, connection_id, api_key, endpoint, prompt_tokens, completion_tokens, cost, tokens
       FROM usage_history WHERE timestamp >= $1`,
      [cutoff],
    );

    for (const r of filtered) {
      const rawTokens = r.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const promptTokens = Number(r.prompt_tokens ?? tokens.prompt_tokens ?? tokens.input_tokens ?? 0);
      const completionTokens = Number(r.completion_tokens ?? tokens.completion_tokens ?? tokens.output_tokens ?? 0);
      const cachedTokens = Number(tokens.cached_tokens || tokens.cache_read_input_tokens || 0);
      const entryCost = Number(r.cost || 0);
      const providerDisplayName = providerNodeNameMap[r.provider] || r.provider;

      stats.totalPromptTokens += promptTokens;
      stats.totalCompletionTokens += completionTokens;
      stats.totalCachedTokens += cachedTokens;
      stats.totalCost += entryCost;

      if (!stats.byProvider[r.provider]) stats.byProvider[r.provider] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[r.provider].requests++;
      stats.byProvider[r.provider].promptTokens += promptTokens;
      stats.byProvider[r.provider].completionTokens += completionTokens;
      stats.byProvider[r.provider].cachedTokens += cachedTokens;
      stats.byProvider[r.provider].cost += entryCost;

      const modelKey = r.provider ? `${r.model} (${r.provider})` : r.model;
      if (!stats.byModel[modelKey]) {
        stats.byModel[modelKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      stats.byModel[modelKey].requests++;
      stats.byModel[modelKey].promptTokens += promptTokens;
      stats.byModel[modelKey].completionTokens += completionTokens;
      stats.byModel[modelKey].cachedTokens += cachedTokens;
      stats.byModel[modelKey].cost += entryCost;
      if (new Date(r.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = r.timestamp;

      if (r.connection_id) {
        const accountName = connectionMap[r.connection_id] || `Account ${r.connection_id.slice(0, 8)}...`;
        const accountKey = `${r.model} (${r.provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, connectionId: r.connection_id, accountName, lastUsed: r.timestamp };
        }
        stats.byAccount[accountKey].requests++;
        stats.byAccount[accountKey].promptTokens += promptTokens;
        stats.byAccount[accountKey].completionTokens += completionTokens;
        stats.byAccount[accountKey].cachedTokens += cachedTokens;
        stats.byAccount[accountKey].cost += entryCost;
        if (new Date(r.timestamp) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = r.timestamp;
      }

      if (r.api_key && typeof r.api_key === "string") {
        const keyInfo = apiKeyMap[r.api_key];
        const keyName = keyInfo?.name || r.api_key.slice(0, 8) + "...";
        const apiKeyMasked = maskApiKey(r.api_key);
        const akKey = `${apiKeyMasked}|${r.model}|${r.provider || "unknown"}`;
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked, keyName, apiKeyKey: apiKeyMasked, lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey[akKey];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      } else {
        if (!stats.byApiKey["local-no-key"]) {
          stats.byApiKey["local-no-key"] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked: null, keyName: "Local (No API Key)", apiKeyKey: "local-no-key", lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey["local-no-key"];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      }

      const endpoint = r.endpoint || "Unknown";
      const epKey = `${endpoint}|${r.model}|${r.provider || "unknown"}`;
      if (!stats.byEndpoint[epKey]) {
        stats.byEndpoint[epKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      const epe = stats.byEndpoint[epKey];
      epe.requests++; epe.promptTokens += promptTokens; epe.completionTokens += completionTokens; epe.cachedTokens += cachedTokens; epe.cost += entryCost;
      if (new Date(r.timestamp) > new Date(epe.lastUsed)) epe.lastUsed = r.timestamp;
    }
  }

  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  return stats;
}

export async function getChartData(period = "7d") {
  const db = await getAdapter();
  const now = Date.now();

  if (period === "today") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();
    const endTime = startTime + bucketCount * bucketMs;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0, requests: 0 }));

    const rows = await db.all(
      `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history WHERE timestamp >= $1`,
      [new Date(startTime).toISOString()],
    );
    for (const row of rows) {
      const t = new Date(row.timestamp).getTime();
      if (t < startTime || t >= endTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].tokens += Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0);
        buckets[idx].cost += Number(row.cost || 0);
        buckets[idx].requests += 1;
      }
    }
    return buckets;
  }

  if (period === "24h") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const startTime = now - bucketCount * bucketMs;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0, requests: 0 }));

    const rows = await db.all(
      `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history WHERE timestamp >= $1`,
      [new Date(startTime).toISOString()],
    );
    for (const row of rows) {
      const t = new Date(row.timestamp).getTime();
      if (t < startTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].tokens += Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0);
        buckets[idx].cost += Number(row.cost || 0);
        buckets[idx].requests += 1;
      }
    }
    return buckets;
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : 60;
  const today = new Date();
  const labelFn = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - bucketCount + 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const dayRows = await db.all(
    `SELECT date_key, data FROM usage_daily WHERE date_key >= $1 ORDER BY date_key ASC`,
    [cutoffKey],
  );
  const dayMap = {};
  for (const row of dayRows) {
    dayMap[row.date_key] = (typeof row.data === "string" ? parseJson(row.data, {}) : row.data) ?? {};
  }

  return Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = dayMap[dateKey];
    return {
      label: labelFn(d),
      tokens: dayData ? (dayData.promptTokens || 0) + (dayData.completionTokens || 0) : 0,
      cost: dayData ? (dayData.cost || 0) : 0,
      requests: dayData ? Number(dayData.requests || 0) : 0,
    };
  });
}

function formatLogDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// No-op: request log is now derived from usageHistory table on read.
export async function appendRequestLog() {}

export async function getRecentLogs(limit = 200) {
  try {
    const db = await getAdapter();
    const rows = await db.all(
      `SELECT timestamp, provider, model, connection_id, prompt_tokens, completion_tokens, status, tokens
       FROM usage_history ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    if (!rows.length) return [];

    const connMap = await getConnectionMapCached();

    return rows.map((row) => {
      const ts = formatLogDate(new Date(row.timestamp));
      const p = row.provider?.toUpperCase() || "-";
      const m = row.model || "-";
      const account = connMap[row.connection_id] || (row.connection_id ? row.connection_id.slice(0, 8) : "-");
      const tk = row.tokens ?? {};
      const sent = row.prompt_tokens ?? tk.prompt_tokens ?? "-";
      const received = row.completion_tokens ?? tk.completion_tokens ?? "-";
      return `${ts} | ${m} | ${p} | ${account} | ${sent} | ${received} | ${row.status || "-"}`;
    });
  } catch (error) {
    console.error("[usageRepo] getRecentLogs failed:", error.message);
    return [];
  }
}