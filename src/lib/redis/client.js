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
  if (!isRedisAvailable() || cooldownSeconds <= 0) return false;
  try {
    await redis.set(`cooldown:conn:${connId}`, "1", "EX", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function isAccountInCooldown(connId) {
  if (!isRedisAvailable()) return false;
  try {
    const val = await redis.get(`cooldown:conn:${connId}`);
    return val === "1";
  } catch {
    return false;
  }
}

export async function setModelCooldown(connId, model, cooldownSeconds) {
  if (!isRedisAvailable() || cooldownSeconds <= 0) return false;
  try {
    await redis.set(`cooldown:model:${connId}:${model}`, "1", "EX", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
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
 * High-performance batch cooldown check for hundreds/thousands of connections in 1 roundtrip.
 * Returns a Set of connection IDs that are in cooldown (either account-wide or model-specific).
 */
export async function getBatchCooldowns(connIds, model = null) {
  if (!isRedisAvailable() || !Array.isArray(connIds) || connIds.length === 0) {
    return new Set();
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

    return cooledDown;
  } catch {
    return new Set();
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
  if (!isRedisAvailable()) return true; // Fail-open gracefully
  try {
    const result = await redis.set(`lock:${key}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch {
    return true;
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
