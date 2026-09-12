import Redis from "ioredis";

// Singleton client to survive Next.js dev server hot-reload
if (!global._redisClient) {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy(times) {
        // Exponential backoff, max 3 seconds
        return Math.min(times * 100, 3000);
      },
      reconnectOnError(err) {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) return true;
        return false;
      },
      lazyConnect: true,
    });

    client.on("connect", () => {
      console.log("[Redis] Connected to speed layer");
    });

    client.on("error", (err) => {
      console.warn(`[Redis] Connection warning: ${err.message}`);
    });

    global._redisClient = client;
    // Attempt non-blocking initial connection
    client.connect().catch(() => {});
  } else {
    global._redisClient = null;
  }
}

const redis = global._redisClient;

export function getRedis() {
  if (redis && redis.status === "ready") {
    return redis;
  }
  return null;
}

export function isRedisAvailable() {
  return !!(redis && redis.status === "ready");
}

/**
 * Fast Cooldown Management (Auto-TTL, Zero DB Cleanup)
 */
export async function setAccountCooldown(connId, cooldownSeconds) {
  if (!isRedisAvailable() || !connId) return false;
  if (cooldownSeconds <= 0) {
    try {
      await redis.del(`cooldown:conn:${connId}`);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await redis.set(`cooldown:conn:${connId}`, "1", "EX", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function isAccountInCooldown(connId) {
  if (!isRedisAvailable() || !connId) return false;
  try {
    const val = await redis.get(`cooldown:conn:${connId}`);
    return val === "1";
  } catch {
    return false;
  }
}

export async function setModelCooldown(connId, model, cooldownSeconds) {
  if (!isRedisAvailable() || !connId || !model) return false;
  if (cooldownSeconds <= 0) {
    try {
      await redis.del(`cooldown:model:${connId}:${model}`);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await redis.set(`cooldown:model:${connId}:${model}`, "1", "EX", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function clearAccountCooldown(connId) {
  return setAccountCooldown(connId, 0);
}

export async function clearModelCooldown(connId, model) {
  return setModelCooldown(connId, model, 0);
}

export async function isModelInCooldown(connId, model) {
  if (!isRedisAvailable()) return false;
  try {
    const val = await redis.get(`cooldown:model:${connId}:${model}`);
    return val === "1";
  } catch {
    return false;
  }
}

/**
 * Consecutive upstream-failure counter per provider/model (combo failover).
 * Keyed by the full member string ("provider/model") so combo members are
 * tracked exactly as configured. All fail-open: without Redis every model
 * simply looks healthy and combo order is unchanged.
 */
export async function incrModelFailCount(member, windowSeconds) {
  if (!isRedisAvailable() || !member) return 0;
  try {
    const key = `modelfail:${member}`;
    const count = await redis.incr(key);
    if (count === 1) {
      // Expire must never void a successful increment — a Redis blip here
      // would silently undercount failover and skew rotation.
      try { await redis.expire(key, Math.max(60, windowSeconds || 900)); } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

export async function resetModelFailCount(member) {
  if (!isRedisAvailable() || !member) return false;
  try {
    await redis.del(`modelfail:${member}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic shared counter (strict round-robin sequence, rate meters, ...).
 * Returns the post-INCR value, or null when Redis is unavailable/failing.
 */
export async function incrSharedCounter(key, expireSeconds = 2592000) {
  if (!isRedisAvailable() || !key) return null;
  try {
    const value = await redis.incr(key);
    if (value === 1) {
      try { await redis.expire(key, expireSeconds); } catch {}
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Delete a shared counter (e.g. rr_seq:<combo> after a combo edit/delete so a
 * stale position never addresses a reordered member list). Fail-open.
 */
export async function delSharedCounter(key) {
  if (!isRedisAvailable() || !key) return false;
  try {
    await redis.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function getModelFailCounts(members) {
  if (!isRedisAvailable() || !Array.isArray(members) || members.length === 0) return {};
  try {
    const keys = members.map((m) => `modelfail:${m}`);
    const values = await redis.mget(...keys);
    const out = {};
    members.forEach((m, i) => { out[m] = Number(values?.[i] || 0); });
    return out;
  } catch {
    return {};
  }
}

/**
 * High-performance batch cooldown check for hundreds/thousands of connections in 1 roundtrip.
 * Returns a Set of connection IDs that are in cooldown (either account-wide or model-specific).
 */
export async function getBatchCooldowns(connIds, model = null) {
  if (!isRedisAvailable() || !Array.isArray(connIds) || connIds.length === 0) {
    return { ids: new Set(), healthy: false };
  }
  try {
    const keys = [];
    for (const id of connIds) {
      keys.push(`cooldown:conn:${id}`);
      if (model) {
        keys.push(`cooldown:model:${id}:${model}`);
      }
    }

    const values = await redis.mget(keys);
    const cooledDown = new Set();
    const stride = model ? 2 : 1;

    for (let i = 0; i < connIds.length; i++) {
      const connId = connIds[i];
      const accountVal = values[i * stride];
      const modelVal = model ? values[i * stride + 1] : null;

      if (accountVal === "1" || modelVal === "1") {
        cooledDown.add(connId);
      }
    }

    return { ids: cooledDown, healthy: true };
  } catch {
    return { ids: new Set(), healthy: false };
  }
}

/**
 * Cache and retrieve full active connections in Redis (L2 speed layer)
 * Survives across multi-replica and reduces Postgres roundtrips to 0
 */
export async function getCachedConnections(provider) {
  if (!isRedisAvailable() || !provider) return null;
  try {
    const raw = await redis.get(`cache:connections:${provider}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedConnections(provider, connections, ttlSeconds = 10) {
  if (!isRedisAvailable() || !provider || !Array.isArray(connections)) return false;
  try {
    await redis.set(`cache:connections:${provider}`, JSON.stringify(connections), "EX", ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function invalidateCachedConnections(provider) {
  if (!isRedisAvailable() || !provider) return false;
  try {
    await redis.del(`cache:connections:${provider}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Distributed Lock (Anti-Race Condition for OAuth Token Refresh)
 */
export async function acquireLock(key, ttlSeconds = 30) {
  if (!isRedisAvailable()) return false;
  try {
    const result = await redis.set(`lock:${key}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch {
    return false;
  }
}

export async function releaseLock(key) {
  if (!isRedisAvailable()) return;
  try {
    await redis.del(`lock:${key}`);
  } catch {}
}

/**
 * In-Flight Concurrency Limiter per Account
 */
export async function incrementInFlight(connId) {
  if (!isRedisAvailable()) return 1;
  try {
    return await redis.incr(`active_req:${connId}`);
  } catch {
    return 1;
  }
}

export async function decrementInFlight(connId) {
  if (!isRedisAvailable()) return 0;
  try {
    const count = await redis.decr(`active_req:${connId}`);
    if (count <= 0) {
      await redis.del(`active_req:${connId}`);
      return 0;
    }
    return count;
  } catch {
    return 0;
  }
}

const ACTIVE_REQUEST_TTL_SECONDS = 120;
const ACTIVE_REQUEST_INDEX = "active_req:index";

export async function registerActiveRequest(requestId, detail) {
  if (!isRedisAvailable() || !requestId) return false;
  try {
    const key = `active_req:detail:${requestId}`;
    const expiresAt = Date.now() + ACTIVE_REQUEST_TTL_SECONDS * 1000;
    await redis.multi()
      .set(key, JSON.stringify({ ...detail, requestId, expiresAt }), "EX", ACTIVE_REQUEST_TTL_SECONDS)
      .zadd(ACTIVE_REQUEST_INDEX, expiresAt, requestId)
      .exec();
    return true;
  } catch {
    return false;
  }
}

export async function unregisterActiveRequest(requestId) {
  if (!isRedisAvailable() || !requestId) return false;
  try {
    await redis.multi()
      .del(`active_req:detail:${requestId}`)
      .zrem(ACTIVE_REQUEST_INDEX, requestId)
      .exec();
    return true;
  } catch {
    return false;
  }
}

export async function getActiveRequestsDistributed() {
  if (!isRedisAvailable()) return [];
  try {
    const now = Date.now();
    const stale = await redis.zrangebyscore(ACTIVE_REQUEST_INDEX, "-inf", now);
    if (stale.length) await redis.zrem(ACTIVE_REQUEST_INDEX, ...stale);
    const ids = await redis.zrangebyscore(ACTIVE_REQUEST_INDEX, now, "+inf");
    if (!ids.length) return [];
    const values = await redis.mget(...ids.map((id) => `active_req:detail:${id}`));
    return values.flatMap((value) => {
      if (!value) return [];
      try { return [JSON.parse(value)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

/**
 * Cluster Real-Time Pub/Sub
 */
export async function publishEvent(channel, payload) {
  if (!isRedisAvailable()) return false;
  try {
    await redis.publish(channel, typeof payload === "string" ? payload : JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Quota Snapshot Cache Layer (L2 Speed Layer)
 */
export async function setCachedQuota(connId, quotaData, ttlSeconds = 120) {
  if (!isRedisAvailable() || !connId) return false;
  try {
    await redis.set(
      `quota:snapshot:${connId}`,
      typeof quotaData === "string" ? quotaData : JSON.stringify(quotaData),
      "EX",
      ttlSeconds
    );
    return true;
  } catch {
    return false;
  }
}

export async function getCachedQuota(connId) {
  if (!isRedisAvailable() || !connId) return null;
  try {
    const raw = await redis.get(`quota:snapshot:${connId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteCachedQuota(connId) {
  if (!isRedisAvailable() || !connId) return false;
  try {
    await redis.del(`quota:snapshot:${connId}`);
    return true;
  } catch {
    return false;
  }
}
