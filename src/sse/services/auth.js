import { getProviderConnections, validateApiKey, updateProviderConnection, getSettings, getProxyPools } from "@/lib/localDb";
import * as localDb from "@/lib/localDb";
import { resolveConnectionProxyConfig, pickProxyPoolId } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isFatalAuthError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
import { MAX_RATE_LIMIT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_COOLDOWN_MS, DEAD_CIRCUIT_THRESHOLD, DEAD_CIRCUIT_WINDOW_S, LKG_TTL_S } from "open-sse/config/errorConfig.js";
import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";
import { getAntigravityQuotaCache, hydrateAntigravityQuotaCache, isAntigravityAccountQuotaExhausted, isAntigravityQuotaMapExhausted } from "./antigravityQuota.js";
import { getFreebuffQuotaCache, verifyFreebuffAccountDirect } from "open-sse/services/usage/freebuff.js";
import { canonicalFreebuffModel } from "open-sse/executors/freebuff.js";
import {
  setAccountCooldown as redisSetAccountCooldown,
  isAccountInCooldown as redisIsAccountInCooldown,
  setModelCooldown as redisSetModelCooldown,
  isModelInCooldown as redisIsModelInCooldown,
  getBatchCooldowns,
  getCachedConnections,
  setCachedConnections,
  invalidateCachedConnections,
  getLkg,
  setLkg,
  delLkg,
  incrDeadCircuit,
  resetDeadCircuit,
  getDeadCircuit,
} from "@/lib/redis/client.js";
import * as log from "../utils/logger.js";
import { bumpRoutingMetric } from "open-sse/services/routingMetrics.js";

// Per-provider mutex map to prevent race conditions during account selection without blocking unrelated providers
const selectionMutexes = new Map();
const ANTIGRAVITY_MODEL_LOCK_MS = 24 * 60 * 60 * 1000;

const GITHUB_MONTHLY_USAGE_LIMIT = "you've reached your additional usage limit for your plan";

function githubMonthlyResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "github" || Number(status) !== 402) return null;
  if (!String(errorText || "").toLowerCase().includes(GITHUB_MONTHLY_USAGE_LIMIT)) return null;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}
// Safe accessor for optional localDb helpers. Direct property access throws
// under vitest strict mocks that omit newer exports, and typeof-access throws
// there too — so probe inside try/catch. Returns the function or null.
function getLocalDbFn(name) {
  try {
    const fn = localDb[name];
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

function isSameFreebuffModel(connModel, targetModel) {
  if (!connModel || !targetModel) return false;
  if (connModel === targetModel) return true;
  const canonicalConn = canonicalFreebuffModel(connModel);
  const canonicalTarget = canonicalFreebuffModel(targetModel);
  if (canonicalConn === canonicalTarget) return true;
  const cleanA = String(connModel).replace(/^(freebuff|fb)\//i, "");
  const cleanB = String(targetModel).replace(/^(freebuff|fb)\//i, "");
  if (cleanA === cleanB) return true;
  const baseA = cleanA.split("/").pop();
  const baseB = cleanB.split("/").pop();
  return baseA === baseB;
}

export function classifyBlockedCredentials(provider, model, connections, { cooledDown = false } = {}) {
  const breakdown = {
    total: connections.length,
    accountExhausted: 0,
    modelExhausted: 0,
    unavailable: 0,
    disabled: 0,
    coolingDown: cooledDown ? connections.length : 0,
  };
  const accountLocks = new Set();
  const modelLocks = new Set();
  const retryExpiries = [];

  for (const connection of connections) {
    const disabled = connection.isActive === false || connection.disabledAt || connection.testStatus === "disabled";
    const refreshBlocked = connection.providerSpecificData?.refreshBlocked === true
      || connection.providerSpecificData?.refreshBlocked === "true";
    const fatalError = typeof connection.lastError === "string"
      && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(connection.lastError);
    const accountLock =
      (connection.lockedAllUntil && new Date(connection.lockedAllUntil).getTime() > Date.now())
      || (connection.rateLimitedUntil && new Date(connection.rateLimitedUntil).getTime() > Date.now())
      || (connection.modelLocks?.__all && new Date(connection.modelLocks.__all).getTime() > Date.now())
      || (connection.modelLock___all && new Date(connection.modelLock___all).getTime() > Date.now());
    const modelLockValue = Boolean(model) && (connection[`modelLock_${model}`] || connection.modelLocks?.[model]);
    const modelLock = modelLockValue && Number.isFinite(new Date(modelLockValue).getTime())
      && new Date(modelLockValue).getTime() > Date.now();
    const unavailable = refreshBlocked || fatalError || ["unavailable", "error", "expired", "invalid"].includes(connection.testStatus);

    if (disabled) breakdown.disabled++;
    else if (connection.testStatus === "exhausted" || accountLock) {
      breakdown.accountExhausted++;
      accountLocks.add(connection.id);
      const expiry = getEarliestModelLockUntil(connection, null);
      if (expiry) retryExpiries.push(expiry);
    } else if (modelLock) {
      breakdown.modelExhausted++;
      modelLocks.add(connection.id);
      const expiry = getEarliestModelLockUntil(connection, model);
      if (expiry) retryExpiries.push(expiry);
    } else if (unavailable) breakdown.unavailable++;
  }

  const blocked = breakdown.accountExhausted + breakdown.modelExhausted
    + breakdown.unavailable + breakdown.disabled + breakdown.coolingDown;
  if (blocked === 0) return null;

  const allAccountExhausted = breakdown.accountExhausted === connections.length;
  const onlyModelExhausted = breakdown.modelExhausted > 0
    && breakdown.modelExhausted === connections.length;
  const allModelExhausted = onlyModelExhausted;
  const allBlockedBySameState = breakdown.accountExhausted + breakdown.modelExhausted + breakdown.unavailable + breakdown.disabled === connections.length;
  const code = allAccountExhausted
    ? "ACCOUNT_EXHAUSTED"
    : allModelExhausted
      ? "MODEL_EXHAUSTED"
      : allBlockedBySameState && breakdown.unavailable + breakdown.disabled === connections.length
        ? "ACCOUNT_UNAVAILABLE"
        : "MIXED_BLOCKED";
  const message = code === "ACCOUNT_EXHAUSTED"
    ? `All ${provider} accounts are exhausted (account quota/credits).`
    : code === "MODEL_EXHAUSTED"
      ? `Model ${model} is exhausted for all ${provider} accounts.`
      : code === "ACCOUNT_UNAVAILABLE"
        ? `All ${provider} accounts are unavailable or disabled.`
        : `No usable ${provider} credentials for ${model || "requested model"}.`;
  const retryAfter = retryExpiries.sort()[0] || null;

  if (code) {
    return {
      allRateLimited: true,
      retryAfter,
      retryAfterHuman: retryAfter
        ? formatRetryAfter(retryAfter)
        : code === "ACCOUNT_EXHAUSTED" || code === "MODEL_EXHAUSTED"
          ? "quota reset time unavailable"
          : "until an account is available",
      lastError: message,
      lastErrorCode: code,
      statusBreakdown: breakdown,
      blockedConnectionIds: [...accountLocks, ...modelLocks],
    };
  }
}


/**
 * Durable + transient eligibility filter shared by the window scan and the
 * last-known-good fast path. Returns true when the connection may serve
 * provider/model right now. Pure w.r.t. its inputs (no I/O).
 */
function isConnectionRoutable(c, ctx) {
  const { excludeSet, locallyExhaustedIds, cooledDownIds, model, providerId, isAntigravity, isFreebuff, antigravityQuotaCache, freebuffQuotaCache } = ctx;
  if (!c || excludeSet.has(c.id)) return false;
  if (locallyExhaustedIds?.has(c.id)) return false;
  if (cooledDownIds?.has(c.id)) return false;
  const refreshBlocked = c.providerSpecificData?.refreshBlocked === true || c.providerSpecificData?.refreshBlocked === "true";
  const fatalError = typeof c.lastError === "string"
    && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(c.lastError);
  if (c.isActive === false || c.disabledAt || c.testStatus === "disabled" || refreshBlocked || fatalError) return false;
  if (["unavailable", "error", "expired", "invalid", "disabled", "exhausted"].includes(c.testStatus)) return false;
  if (c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now()) return false;
  if (c.lockedAllUntil && new Date(c.lockedAllUntil).getTime() > Date.now()) return false;
  if (isModelLockActive(c, model)) return false;
  if (isAntigravity && model && antigravityQuotaCache) {
    let quota = antigravityQuotaCache.get(c.id)?.[model];
    if (!quota) {
      const modelLower = model.toLowerCase();
      const weeklyKey = (modelLower.startsWith("gemini-") && !modelLower.includes("image"))
        ? "gemini_weekly"
        : (modelLower.startsWith("claude-") || modelLower.startsWith("gpt-"))
          ? "claude_gpt_weekly"
          : null;
      if (weeklyKey) quota = antigravityQuotaCache.get(c.id)?.[weeklyKey];
    }
    if (quota && quota.remainingPercentage <= 0 && quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()) return false;
  }
  if (isFreebuff && model && freebuffQuotaCache) {
    const cacheMap = freebuffQuotaCache.get(c.id);
    const canonical = canonicalFreebuffModel(model);
    const quota = cacheMap?.[canonical] || cacheMap?.[model];
    if (quota && !quota.unlimited && quota.remaining !== null && quota.remaining <= 0 && quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()) return false;
  }
  return true;
}

/**
 * Get provider credentials from localDb
 * Filters out unavailable accounts and returns the selected account based on strategy
 * @param {string} provider - Provider name
 * @param {Set<string>|string|null} excludeConnectionIds - Connection ID(s) to exclude (for retry with next account)
 * @param {string|null} model - Model name for per-model rate limit filtering
 */
export async function getProviderCredentials(provider, excludeConnectionIds = null, model = null, options = {}) {
  // Normalize to Set for consistent handling
  const excludeSet = excludeConnectionIds instanceof Set
    ? excludeConnectionIds
    : (excludeConnectionIds ? new Set([excludeConnectionIds]) : new Set());
  const preferredConnectionId = options?.preferredConnectionId || null;

  // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
  const providerId = resolveProviderId(provider);
  // Per-provider mutex: concurrency for different providers remains non-blocking
  const currentMutex = selectionMutexes.get(providerId) || Promise.resolve();
  let resolveMutex;
  const nextMutex = new Promise(resolve => { resolveMutex = resolve; });
  selectionMutexes.set(providerId, nextMutex);

  try {
    await currentMutex;

    // Inject a virtual connection for no-auth free providers (with optional proxy pool or proxy group from settings)
    if (FREE_PROVIDERS[providerId]?.noAuth) {
      const settings = await getSettings();
      const override = (settings.providerStrategies || {})[providerId] || {};
      const strategy = override.rotateStrategy || "none";
      const proxyGroup = override.proxyGroup || null;
      let pickedId = override.proxyPoolId || null;
      let poolIds = [];
      let resolvedProxy = null;

      if (proxyGroup) {
        const groupStrategy = strategy !== "none" ? strategy : "smart";
        resolvedProxy = await resolveConnectionProxyConfig(
          {
            proxyGroup,
            proxyRotationStrategy: groupStrategy,
            proxyPoolScope: `${providerId}::${model || "*"}`,
          },
          `noauth-${providerId}`
        );
      } else if (strategy !== "none") {
        const allPools = await getProxyPools({ isActive: true });
        poolIds = allPools.filter(p => p.proxyUrl).map(p => p.id);
        // Scope region-aware ("smart") filtering to this provider/model so
        // pools marked unfit here are skipped.
        const scope = `${providerId}::${model || "*"}`;
        pickedId = pickProxyPoolId(poolIds, strategy, providerId, { scope });
        resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: pickedId || "" });
      } else if (override.proxyPoolId) {
        poolIds = [override.proxyPoolId];
        resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: override.proxyPoolId });
      } else {
        resolvedProxy = await resolveConnectionProxyConfig({});
      }

      return {
        id: "noauth",
        connectionName: "Public",
        isActive: true,
        accessToken: "public",
        providerSpecificData: {
          connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
          connectionProxyUrl: resolvedProxy.connectionProxyUrl,
          connectionNoProxy: resolvedProxy.connectionNoProxy,
          connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
          vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
          proxyPoolId: resolvedProxy.proxyPoolId || null,
          strictProxy: resolvedProxy.strictProxy === true,
          proxyGroup: proxyGroup || undefined,
          // Let chatCore's pool-scoped retry rotate across the same candidate
          // pool set (excluding the failed pool) instead of reusing it — this
          // is what makes per-IP limit retries work for no-auth providers.
          proxyPoolIds: poolIds.length > 0 ? poolIds : undefined,
          proxyRotationStrategy: strategy,
        },
      };
    }

    // Query a bounded candidate window from PostgreSQL. The previous path
    // loaded every active credential for a provider into Node and Redis, which
    // is unsafe for providers with tens of thousands of accounts.
    const candidateWindow = Math.min(Math.max(Number(options.candidateLimit) || 100, 25), 500);
    const settings = await getSettings();
    const providerOverride = (settings.providerStrategies || {})[providerId] || {};

    // 1. Dead provider/model circuit: consecutive fleet-wide empty selections
    // short-circuit to a fast 503 — no PG scan, no rotation budget burned.
    const deadCount = await getDeadCircuit(providerId, model).catch(() => 0);
    if (deadCount >= DEAD_CIRCUIT_THRESHOLD) {
      const retryAfter = new Date(Date.now() + DEAD_CIRCUIT_WINDOW_S * 1000).toISOString();
      log.warn("AUTH", `${providerId} | circuit open (${deadCount}x empty) — fast 503 for ${model || "any"}`);
      bumpRoutingMetric("circuitTrips");
      return {
        allRateLimited: true,
        retryAfter,
        retryAfterHuman: "1m",
        lastError: `All ${providerId} accounts recently exhausted (circuit) — retry shortly.`,
        lastErrorCode: "PROVIDER_CIRCUIT_OPEN",
      };
    }

    // 2. Last-known-good fast path: one proven account skips the whole scan
    // (2 cheap roundtrips: Redis GET + single-row PG read + 1-id cooldown
    // batch). Honors exclusions; stale pointers self-heal via delLkg on the
    // error path.
    const lkgId = await getLkg(providerId, model).catch(() => null);
    if (lkgId && !excludeSet.has(lkgId)) {
      try {
        const lkgRow = await localDb.getProviderConnectionById(lkgId).catch(() => null);
        if (lkgRow && lkgRow.provider === providerId) {
          const lkgCool = await getBatchCooldowns([lkgId], model).catch(() => ({ ids: new Set(), healthy: true }));
          const lkgCtx = {
            excludeSet, locallyExhaustedIds: new Set(),
            cooledDownIds: lkgCool?.ids instanceof Set ? lkgCool.ids : lkgCool,
            model, providerId,
            isAntigravity: providerId === "antigravity",
            isFreebuff: providerId === "freebuff",
            antigravityQuotaCache: getAntigravityQuotaCache(),
            freebuffQuotaCache: getFreebuffQuotaCache(),
          };
          if (isConnectionRoutable(lkgRow, lkgCtx)) {
            bumpRoutingMetric("lkgHits");
            log.debug("AUTH", `${providerId} | LKG hit ${lkgId.slice(0, 8)} for ${model || "any"}`);
            if (excludeSet.size === 0) resetDeadCircuit(providerId, model).catch(() => {});
            return finalizeSelection(lkgRow);
          }
          bumpRoutingMetric("lkgStale");
        }
      } catch {}
    }

    // 3. Window scan (up to 2 windows): SQL pre-filters durable eligibility;
    // the second window covers providers whose first `candidateWindow` rows
    // are all transiently filtered (Redis cooldowns / RAM quota blocks).
    const MAX_SELECTION_WINDOWS = 2;
    const isAntigravity = providerId === "antigravity";
    const isFreebuff = providerId === "freebuff";
    let connections = [];
    let availableConnections = [];
    let cooledDownIds = new Set();
    let redisCooldownHealthy = true;
    let locallyExhaustedIds = new Set();
    let lastCandidateIds = [];
    for (let windowIdx = 0; windowIdx < MAX_SELECTION_WINDOWS; windowIdx++) {
      const batch = await getProviderConnections({
        provider: providerId,
        isActive: true,
        routingModel: model,
        excludeIds: [...excludeSet],
        limit: candidateWindow,
        offset: windowIdx * candidateWindow,
      });
      if (batch.length === 0) break;
      connections = connections.concat(batch);

      if (isAntigravity && model) {
        const antigravityQuotaCache = getAntigravityQuotaCache();
        let snapshots = [];
        try {
          const getSnapshots = getLocalDbFn("getBatchProviderQuotas");
          if (typeof getSnapshots === "function") {
            snapshots = await getSnapshots(providerId).catch(() => []);
          }
        } catch {}
        for (const snapshot of snapshots) {
          if (snapshot?.connectionId && snapshot.quotas) {
            hydrateAntigravityQuotaCache(snapshot.connectionId, snapshot.quotas);
          }
        }
        locallyExhaustedIds = new Set(
          batch
            .filter((connection) => isAntigravityAccountQuotaExhausted(connection.id))
            .map((connection) => connection.id),
        );
      }

      const candidateIds = batch.map(c => c.id).filter(id => !excludeSet.has(id));
      lastCandidateIds = candidateIds;
      const cooldownResult = await getBatchCooldowns(candidateIds, model);
      cooledDownIds = cooldownResult?.ids instanceof Set ? cooldownResult.ids : cooldownResult;
      redisCooldownHealthy = cooldownResult?.healthy !== false;

      const ctx = {
        excludeSet, locallyExhaustedIds, cooledDownIds, model, providerId,
        isAntigravity, isFreebuff,
        antigravityQuotaCache: isAntigravity && model ? getAntigravityQuotaCache() : null,
        freebuffQuotaCache: isFreebuff && model ? getFreebuffQuotaCache() : null,
      };
      availableConnections = batch.filter(c => isConnectionRoutable(c, ctx));
      if (availableConnections.length > 0) break;
    }
    let connectionsFromCache = false;

    log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeIds: ${excludeSet.size > 0 ? [...excludeSet].join(",") : "none"}, model: ${model || "any"}`);

    if (connections.length === 0) {
      // The routing query intentionally asks for active rows only. Inspect
      // all provider rows before reporting "no credentials" so disabled and
      // unavailable accounts are not confused with a missing provider.
      const allConnections = await getProviderConnections({ provider: providerId });
      const blocked = classifyBlockedCredentials(provider, model, allConnections);
      if (blocked) return blocked;
      log.warn("AUTH", `No credentials for ${provider}`);
      // Rows exist but none are routable (and this is a fresh selection):
      // feed the dead-circuit like the filtered-empty path below. A provider
      // with zero rows at all is misconfiguration, not exhaustion — skip it.
      if (excludeSet.size === 0 && allConnections.length > 0) {
        incrDeadCircuit(providerId, model, DEAD_CIRCUIT_WINDOW_S).catch(() => {});
      }
      return null;
    }

    // Live quota-cache maps (RAM, hydrated per window above). Hoisted for the
    // empty-window diagnostics below; the window loop owns hydration.
    const antigravityQuotaCache = isAntigravity && model ? getAntigravityQuotaCache() : null;
    const freebuffQuotaCache = isFreebuff && model ? getFreebuffQuotaCache() : null;

    // Freebuff 1-hour dynamic model affinity lock:
    // 1 account can only serve 1 model at a time. If locked to model X, it can only serve model X.
    // Accounts with no active lock can serve any model. Prioritize matching locked accounts.
    if (providerId === "freebuff" && model && availableConnections.length > 0) {
      const now = Date.now();
      const affinityCandidates = availableConnections;
      const matchingLocked = [];
      const unlocked = [];

      for (const c of affinityCandidates) {
        const isLocked = Boolean(
          c.lockedToModel &&
          c.lockedToModelUntil &&
          new Date(c.lockedToModelUntil).getTime() > now
        );

        if (isLocked) {
          if (isSameFreebuffModel(c.lockedToModel, model)) {
            matchingLocked.push(c);
          }
          // Account locked to another model -> excluded!
        } else {
          unlocked.push(c);
        }
      }

      if (matchingLocked.length > 0) {
        // Prioritize accounts already locked to this model to prevent lock fragmentation
        availableConnections = matchingLocked;
      } else if (unlocked.length > 0) {
        // Fall back to clean/unlocked accounts
        availableConnections = unlocked;
      } else {
        // All accounts are currently locked to other models!
        const lockedExpiries = affinityCandidates
          .filter((c) => c.lockedToModel && c.lockedToModelUntil && new Date(c.lockedToModelUntil).getTime() > now)
          .map((c) => c.lockedToModelUntil)
          .sort();
        const earliestExpiry = lockedExpiries[0] || null;
        log.warn("AUTH", `Freebuff | all ${affinityCandidates.length} eligible accounts locked to other models — requested: ${model}`);
        return {
          allRateLimited: true,
          retryAfter: earliestExpiry,
          retryAfterHuman: earliestExpiry ? formatRetryAfter(earliestExpiry) : "1h",
          lastError: `All Freebuff accounts are currently locked to other models. Next session releases in ${earliestExpiry ? formatRetryAfter(earliestExpiry) : "1h"}.`,
          lastErrorCode: "FREEBUFF_MODEL_LOCKED",
        };
      }
    }

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    connections.forEach(c => {
      const excluded = excludeSet.has(c.id);
      const locked = isModelLockActive(c, model);
      if (excluded || locked) {
        const lockUntil = getEarliestModelLockUntil(c, model);
        log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
      }
    });

    if (availableConnections.length === 0) {
      // A cached connection list may be stale. Re-read all rows before
      // classifying the failure so Redis cannot hide exhausted/disabled state.
      const stateConnections = await getProviderConnections({ provider: providerId, limit: 500 });
      if (isAntigravity && model) {
        const readQuotas = getLocalDbFn("getBatchProviderQuotas");
        const agSnapshots = readQuotas ? await readQuotas(providerId).catch(() => []) : [];
        for (const snapshot of agSnapshots) {
          if (snapshot?.connectionId && snapshot.quotas) hydrateAntigravityQuotaCache(snapshot.connectionId, snapshot.quotas);
        }
      }
      // Find earliest persistent lock or lazy Antigravity quota-cache reset for retry timing.
      const lockedConns = stateConnections.filter(c => isModelLockActive(c, model));
      const expiries = lockedConns.map(c => getEarliestModelLockUntil(c, model)).filter(Boolean);
      if (isAntigravity && model && antigravityQuotaCache) {
        stateConnections.forEach((c) => {
          const resetAt = antigravityQuotaCache.get(c.id)?.[model]?.resetAt;
          if (resetAt && new Date(resetAt).getTime() > Date.now()) expiries.push(resetAt);
        });
      }
      if (isFreebuff && model && freebuffQuotaCache) {
        stateConnections.forEach((c) => {
          const resetAt = freebuffQuotaCache.get(c.id)?.[model]?.resetAt;
          if (resetAt && new Date(resetAt).getTime() > Date.now()) expiries.push(resetAt);
        });
      }
      const earliest = expiries.sort()[0] || null;
      if (earliest) {
        const earliestConn = lockedConns[0];
        const classified = classifyBlockedCredentials(provider, model, stateConnections);
        log.warn("AUTH", `${provider} | all ${stateConnections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
        return {
          allRateLimited: true,
          retryAfter: earliest,
          retryAfterHuman: formatRetryAfter(earliest),
          lastError: classified?.lastError || `Model ${model} is exhausted for all ${provider} accounts.`,
          lastErrorCode: classified?.lastErrorCode || "MODEL_EXHAUSTED",
        };
      }

      const excludedAll = lastCandidateIds.length === 0 && excludeSet.size > 0;
      const blocked = classifyBlockedCredentials(provider, model, stateConnections, {
        cooledDown: redisCooldownHealthy && !excludedAll && cooledDownIds.size > 0 && cooledDownIds.size >= lastCandidateIds.length,
      });
      if (blocked) return blocked;

      log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
      // Fleet signal: a FRESH selection (no exclusions) that finds nothing
      // means the provider/model is likely fully dead — count toward the
      // dead-circuit so subsequent requests short-circuit fast.
      if (excludeSet.size === 0) incrDeadCircuit(providerId, model, DEAD_CIRCUIT_WINDOW_S).catch(() => {});
      return null;
    }

    // A routable account exists — the provider/model has capacity; make sure
    // a previously opened dead-circuit is closed.
    if (excludeSet.size === 0) resetDeadCircuit(providerId, model).catch(() => {});

    // Per-provider strategy overrides global setting
    const strategy = providerOverride.fallbackStrategy || settings.fallbackStrategy || "fill-first";

    let connection;
    // Pin to preferred connection if specified and available.
    // Strict pin (model probes): a missed pin is an honest error, never a
    // silent fallback to a sibling account (which would report health for
    // the wrong connection).
    if (preferredConnectionId) {
      connection = availableConnections.find((c) => c.id === preferredConnectionId);
      if (connection) {
        log.info("AUTH", `${provider} | pinned to ${connection.id?.slice(0, 8)} (${connection.name || connection.email || "unnamed"})`);
      } else if (options?.strictPin) {
        log.warn("AUTH", `${provider} | strict pin missed: ${preferredConnectionId.slice(0, 8)} not routable`);
        return {
          pinnedMiss: true,
          connectionId: preferredConnectionId,
          lastError: `Pinned connection ${preferredConnectionId.slice(0, 8)}... is not currently routable (locked, cooling down, or disabled).`,
          lastErrorCode: "PINNED_UNAVAILABLE",
        };
      }
    }
    if (connection) {
      // skip strategy
    } else if (strategy === "round-robin") {
      const stickyLimit = providerOverride.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3;

      // Sort by lastUsed (most recent first) to find current candidate
      const byRecency = [...availableConnections].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const current = byRecency[0];
      const currentCount = current?.consecutiveUseCount || 0;

      if (current && current.lastUsedAt && currentCount < stickyLimit) {
        // Stay with current account
        connection = current;
        // Update lastUsedAt and increment count (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: (connection.consecutiveUseCount || 0) + 1
        });
      } else {
        // Pick the least recently used (excluding current if possible)
        const sortedByOldest = [...availableConnections].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        // Update lastUsedAt and reset count to 1 (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: 1
        });
      }
    } else {
      // Default: fill-first with Top-5 Fair-Share Jitter (Decision #6)
      if (availableConnections.length > 1) {
        // Take top candidates up to 5
        const candidates = availableConnections.slice(0, Math.min(5, availableConnections.length));
        // Pick 1 randomly with jitter
        const pickedIdx = Math.floor(Math.random() * candidates.length);
        connection = candidates[pickedIdx];
      } else {
        connection = availableConnections[0];
      }
      // Fire-and-forget touch last_used_at for fair-share distribution
      if (connection?.id) {
        try {
          const res = updateProviderConnection(connection.id, {
            lastUsedAt: new Date().toISOString(),
          });
          if (res && typeof res.catch === "function") res.catch(() => {});
        } catch {}
      }
    }

    return finalizeSelection(connection);

    // Single shape builder for the credentials contract (connectionId, tokens,
    // proxy resolution). Both the window scan and the LKG fast path return
    // through here so callers never see a raw DB row. Function declaration
    // (hoisted) because the LKG fast path above uses it before this line.
    async function finalizeSelection(connection) {
    // Scope the region-aware picker to this provider/model (e.g. freebuff::gpt-5.6-luna)
    const hasPoolConfig = connection.providerSpecificData?.proxyPoolIds?.length || connection.providerSpecificData?.proxyGroup;
    const psdForProxy = hasPoolConfig
      ? { ...connection.providerSpecificData, proxyPoolScope: `${providerId}::${model || ""}` }
      : connection.providerSpecificData;
    const resolvedProxy = await resolveConnectionProxyConfig(psdForProxy || {}, connection.id);

    return {
      authType: connection.authType,
      apiKey: connection.apiKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      idToken: connection.idToken,
      expiresAt: connection.expiresAt,
      expiresIn: connection.expiresIn,
      lastRefreshAt: connection.lastRefreshAt,
      projectId: connection.projectId,
      connectionName: connection.displayName || connection.name || connection.email || connection.id,
      copilotToken: connection.providerSpecificData?.copilotToken,
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
        connectionProxyUrl: resolvedProxy.connectionProxyUrl,
        connectionNoProxy: resolvedProxy.connectionNoProxy,
        connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
        vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
        proxyPoolId: resolvedProxy.proxyPoolId || null,
        noFitPool: resolvedProxy.noFitPool === true,
        strictProxy: resolvedProxy.strictProxy === true,
      },
      connectionId: connection.id,
      // Include current status for optimization check
      testStatus: connection.testStatus,
      lastError: connection.lastError,
      // Pass full connection for clearAccountError to read modelLock_* keys
      _connection: connection
      };
    }
  } finally {
    if (resolveMutex) resolveMutex();
    if (selectionMutexes.get(providerId) === nextMutex) {
      selectionMutexes.delete(providerId);
    }
  }
}

/**
 * Extract validation URL and message from Antigravity/Google VALIDATION_REQUIRED 403 error.
 * Supports Google RPC ErrorInfo (details[].metadata.validation_url), error.metadata.validation_url,
 * and JSON/regex fallbacks.
 * @param {string|object} errorText
 * @returns {{ url: string, message: string }|null}
 */
export function extractValidationUrl(errorText) {
  if (!errorText) return null;
  const str = typeof errorText === "string" ? errorText : JSON.stringify(errorText);

  if (!/validation_url|validationUrl|VALIDATION_REQUIRED|action_required|verify.*account|verification required/i.test(str)) {
    return null;
  }

  // Deep-search any nesting level for a validation URL key. Google nests it
  // under details[].metadata, error.metadata, or deeper wrappers depending on
  // the surface (Antigravity RPC, Gemini REST, proxy-wrapped bodies) — a
  // fixed-depth lookup silently misses new shapes and leaves a stale URL
  // stored on the account. Two passes: exact validation_url KEYS anywhere in
  // the tree first (a docs URL inside a message string must never shadow the
  // real key), then bare verification-looking URLs in free text.
  const deepFindKeyUrl = (node, depth = 0) => {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindKeyUrl(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (/^validation_?url$/i.test(key) && typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
          return value.trim();
        }
      }
      for (const value of Object.values(node)) {
        const found = deepFindKeyUrl(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const deepFindUrl = (node, depth = 0) => {
    if (!node || depth > 8) return null;
    if (typeof node === "string") {
      const m = node.match(/https?:\/\/[^\s"'<>\\]+/i);
      return m ? m[0] : null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindUrl(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node)) {
        const found = deepFindUrl(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  // Message for the dashboard badge (first human-readable message found).
  const deepFindMessage = (node, depth = 0) => {
    if (!node || depth > 6) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindMessage(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      if (typeof node.message === "string" && node.message.trim()) return node.message.trim();
      if (typeof node.msg === "string" && node.msg.trim()) return node.msg.trim();
      for (const value of Object.values(node)) {
        const found = deepFindMessage(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  try {
    const jsonStart = str.indexOf("{");
    if (jsonStart !== -1) {
      const parsed = JSON.parse(str.slice(jsonStart));
      const errorObj = parsed.error || parsed;
      const url = deepFindKeyUrl(errorObj) || deepFindUrl(errorObj);
      if (url) {
        return {
          url,
          message: deepFindMessage(errorObj) || "Verification required by Google",
        };
      }
    }
  } catch {
    // JSON parse failed, fallback to regex below
  }

  const urlMatch = str.match(/(?:validation_url|validationUrl)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/i);
  if (urlMatch && urlMatch[1]) {
    const msgMatch = str.match(/"message"\s*:\s*"([^"]+)"/i);
    return {
      url: urlMatch[1].trim(),
      message: msgMatch ? msgMatch[1].trim() : "Verification required by Google",
    };
  }

  // Last resort: bare actionable URL inside a human message. The gate above
  // already proved action-required markers exist in the text, so the markers
  // live around the URL, not necessarily inside it — real Google links look
  // like accounts.google.com/signin/continue?... with no "verify" in the URL
  // itself. Prefer sign-in/auth/verify hosts, else take the first URL.
  const allUrls = [...str.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) => m[0].trim());
  const actionable = allUrls.find((u) => /accounts\.google\.|signin|oauth|auth|verif|valid|challenge|confirm|validate/i.test(u));
  if (actionable || allUrls.length > 0) {
    return { url: (actionable || allUrls[0]).trim(), message: "Verification required by Google" };
  }

  return null;
}

/**
 * Mark account+model as unavailable — locks modelLock_${model} in DB.
 * All errors (429, 401, 5xx, etc.) lock per model, not per account.
 * @param {string} connectionId
 * @param {number} status - HTTP status code from upstream
 * @param {string} errorText
 * @param {string|null} provider
 * @param {string|null} model - The specific model that triggered the error
 * @param {number|null} resetsAtMs - Precise upstream reset time when known
 * @param {string} [freebuffKind] - Freebuff gate kind: "banned" | "country_blocked" | "free_mode_unavailable"
 * @returns {{ shouldFallback: boolean, cooldownMs: number }}
 */
export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null, freebuffKind = null) {
  if (!connectionId || connectionId === "noauth") return { shouldFallback: false, cooldownMs: 0 };
  const connections = await getProviderConnections({ provider });
  const conn = connections.find(c => c.id === connectionId);
  const backoffLevel = conn?.backoffLevel || 0;

  // A Freebuff proxy-egress refusal (free_mode_unavailable / anonymous_network)
  // is NOT an account fault — the pool already rotated in chatCore, so just
  // fall back to the next account with zero cooldown. Must stay BEFORE the
  // banned check so the bare "banned" substring rules can never touch it.
  const providerIdEarly = resolveProviderId(provider);
  const freebuffProxyRefusal = providerIdEarly === "freebuff"
    && (freebuffKind === "free_mode_unavailable"
      || /free_mode_unavailable|anonymous_network|rotating proxy/i.test(String(errorText || "")));
  if (freebuffProxyRefusal) {
    // The proxy egress was refused, but the account itself may still be
    // banned upstream — the refusal masks it. Verify via direct egress
    // (GET /session, no quota burned) so a truly banned account gets
    // disabled immediately instead of cycling through fallback forever.
    if (conn) {
      const accessToken = conn.accessToken || null;
      verifyFreebuffAccountDirect(accessToken).then((verdict) => {
        if (verdict !== "banned") return;
        const connName = conn.displayName || conn.name || conn.email || connectionId.slice(0, 8);
        const reason = `Freebuff account "${connName}" banned (403, verified via direct egress after proxy refusal): {"status":"banned"}`;
        updateProviderConnection(connectionId, {
          isActive: false,
          testStatus: "disabled",
          previousStatus: conn?.testStatus || "active",
          disabledReason: reason,
          disabledAt: new Date().toISOString(),
          disabledBy: "system",
          lastError: reason,
          errorCode: 403,
          lastErrorAt: new Date().toISOString(),
          backoffLevel: 0,
          modelLock___all: null,
          modelLocks: {},
          lockedAllUntil: null,
          lockedToModel: null,
          lockedToModelUntil: null,
          rateLimitedUntil: null,
        }).then(() => {
          invalidateCachedConnections(providerIdEarly).catch(() => {});
          redisSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
          log.warn("AUTH", `${connName} Freebuff account banned (verified direct) — DISABLED (is_active=false), removed from routing`);
        }).catch((e) => {
          log.warn("AUTH", `Failed to disable banned Freebuff account ${connName}:`, e);
        });
      }).catch(() => {});
    }
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // Freebuff limited IP tier (rate limited on proxy IP, e.g. Freebucks 25/25 limit)
  // is NOT an account fault — set 30s Redis cooldown only, do NOT lock model in DB.
  const freebuffLimitedIp = providerIdEarly === "freebuff"
    && (freebuffKind === "limited_ip"
      || /accesstier["']?\s*:\s*["']?limited|pool["']?\s*:\s*["']?freebucks|limited-tier|limited_ip/i.test(String(errorText || "")));
  if (freebuffLimitedIp) {
    if (model) {
      redisSetModelCooldown(connectionId, model, 30).catch(() => {});
    }
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${connName} Freebuff limited IP tier (proxy-bound) — setting 30s in-memory/Redis cooldown for ${model || "all"} (no DB model lock)`);
    return { shouldFallback: true, cooldownMs: 30000 };
  }

  // A Freebuff account the backend reports as banned is permanently dead:
  // take it out of routing entirely (is_active=false, status disabled) rather
  // than a timed cooldown that would re-select it after the window lapses.
  // country_blocked is NOT an account fault — the proxy/region is blocked — so
  // it must never disable the account here; it falls through to the generic
  // path and the short-cooldown country rules in ERROR_RULES.
  const providerId = resolveProviderId(provider);
  const freebuffBanned = providerId === "freebuff"
    && (freebuffKind === "banned" || /(^|[^a-z])banned([^a-z]|$)/i.test(String(errorText || "")));
  if (freebuffBanned) {
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    const rawReason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Freebuff account banned");
    const reason = rawReason.includes(connName) ? rawReason : `Freebuff account "${connName}" banned (403): ${rawReason}`;
    await updateProviderConnection(connectionId, {
      isActive: false,
      testStatus: "disabled",
      previousStatus: conn?.testStatus || "active",
      disabledReason: reason,
      disabledAt: new Date().toISOString(),
      disabledBy: "system",
      errorCode: status || 403,
      lastErrorAt: new Date().toISOString(),
      backoffLevel: 0,
      modelLock___all: null,
      modelLocks: {},
      lockedAllUntil: null,
      lockedToModel: null,
      lockedToModelUntil: null,
      rateLimitedUntil: null,
    });
    await invalidateCachedConnections(providerId).catch(() => {});
    // Long L2 cooldown so the Redis-cached path also stops returning it.
    redisSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
    log.warn("AUTH", `${connName} Freebuff account banned — DISABLED (is_active=false), removed from routing`);
    console.error(`❌ ${provider} [${status}]: ${reason}`);
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // GitHub premium-request exhaustion is account-wide until the next UTC month.
  const githubResetAtMs = githubMonthlyResetMs(status, errorText, provider);
  const is524Timeout = status === 524 || /524|gateway timeout|timeout occurred/i.test(String(errorText || ""));

  // Providers whose quota/credits are account-wide across ALL models
  // Cline-free free tier: all models share a single daily request budget
  const POOLED_QUOTA_PROVIDERS = new Set(["codex", "codebuddy-cn", "codebuddy-intl", "github", "grok-cli", "cline-free"]);
  const isPooledQuotaProvider = POOLED_QUOTA_PROVIDERS.has(providerId);

  // Provider-specific precise cooldown (e.g. codex usage_limit_reached resets_at, antigravity quotaResetTimeStamp) overrides backoff
  let shouldFallback, cooldownMs, newBackoffLevel, lockAll = false, disableAccount = false, isExhausted = false;
  if (githubResetAtMs) {
    shouldFallback = true;
    cooldownMs = githubResetAtMs - Date.now();
    newBackoffLevel = 0;
    lockAll = true;
  } else if (resetsAtMs && resetsAtMs > Date.now()) {
    shouldFallback = true;
    cooldownMs = Math.min(resetsAtMs - Date.now(), resolveProviderId(provider) === "freebuff" ? 26 * 60 * 60 * 1000 : MAX_RATE_LIMIT_COOLDOWN_MS);
    newBackoffLevel = 0;
    if (isPooledQuotaProvider) lockAll = true;
  } else {
    ({ shouldFallback, cooldownMs, newBackoffLevel, lockAll, disableAccount, isExhausted } = checkFallbackError(status, errorText, backoffLevel));
    if (isPooledQuotaProvider && (status === 429 || (status === 402 && providerId !== "github"))) lockAll = true;
  }

  // A model-scoped 429 is a model exhaustion, not an account exhaustion. Keep
  // the account active so it can still serve other models. Only account-wide
  // quota locks receive testStatus=exhausted.
  if (status === 429 && !is524Timeout) {
    const lowerErrorText = String(errorText || "").toLowerCase();
    // Daily/individual quota exhaustion → lock ALL models on this account
    const isDailyCap429 = /daily|limit reached|try again in \d+h|individual quota|exhausted.*capacity|quota.*r[e\i]set|quota.*reset/i.test(lowerErrorText);
    if (isDailyCap429) {
      lockAll = true;
    }
    // Every 429 must be cooled down. If the provider did not return a usable
    // reset timestamp, use the stable default instead of the short exponential
    // backoff that causes the same exhausted account to be retried repeatedly.
    // A matched daily-cap rule already carries its own conservative cooldown
    // (24h): keep the larger of the two when no precise reset time exists, so
    // e.g. a Cline daily cap with no "Try again in" hint does not retry-storm
    // every 30 minutes against an 8-24h upstream reset window.
    cooldownMs = resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : Math.max(DEFAULT_RATE_LIMIT_COOLDOWN_MS, isDailyCap429 ? (cooldownMs || 0) : 0);
    isExhausted = lockAll;
  }

  // Antigravity quota snapshots cover the whole account. Once every tracked
  // non-image bucket is exhausted, expose the account as exhausted instead of
  // leaving it merely model-locked and repeatedly selecting it later.
  if (providerId === "antigravity" && resetsAtMs && isAntigravityAccountQuotaExhausted(connectionId)) {
    lockAll = true;
    isExhausted = true;
  }

  // 524 / Gateway timeout: upstream server is temporarily slow or down.
  // NEVER disable account, NEVER lock all models, cooldown capped at max 5 minutes (default 0).
  if (is524Timeout) {
    lockAll = false;
    disableAccount = false;
    cooldownMs = Math.min(cooldownMs || 0, 5 * 60 * 1000);
    newBackoffLevel = 0;
  }
  // Model-level restrictions (e.g. OpenRouter free model agentic harness gate,
  // or error message explicitly references the model or model restriction) must
  // NEVER lock the entire account — only lock the specific model!
  const lowerErr = String(errorText || "").toLowerCase();
  const opencodeZenCredentialInvalid = providerId === "opencode-zen"
    && /invalid[_ ](?:api[_ ]key|token|credential)|api key[^\n]{0,40}invalid|invalid[^\n]{0,40}api key|revoked|invalid_grant|unauthenticated/i.test(lowerErr);
  const opencodeZenModelOnlyError = providerId === "opencode-zen" && !opencodeZenCredentialInvalid;
  const modelShortName = model ? (model.split("/").pop() || "").toLowerCase() : "";
  const isModelSpecificRestriction = Boolean(
    model &&
    !isPooledQuotaProvider &&
    !isFatalAuthError(status, errorText) &&
    (
      (modelShortName && lowerErr.includes(modelShortName)) ||
      lowerErr.includes(model.toLowerCase()) ||
      /agentic harness|routing_funnel|failed_routing_step|only available|not supported for|upgrade to access|model not supported|model is restricted|endpoint is not available|gate free endpoints/i.test(lowerErr)
    )
  );

  // OpenRouter shared-pool rate limits (is_byok:false, upstream_provider_shared_pool)
  // are per-model, never per-account. This matches poolside/laguna:free 429s.
  const isOpenRouterSharedPool429 = providerId === "openrouter"
    && status === 429
    && /is_byok["']?\s*:\s*false|shared_pool|temporarily rate-limited upstream/i.test(lowerErr);
  if (isOpenRouterSharedPool429) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = Math.max(cooldownMs || 0, Math.min(DEFAULT_RATE_LIMIT_COOLDOWN_MS, 60 * 1000));
  }

  // OpenCode Zen must keep the API-key connection routable for free models.
  // Its paid-model billing/entitlement failures are model-scoped, even when
  // the upstream uses HTTP 401. Only an explicitly invalid/revoked key may
  // disable the connection.
  if (opencodeZenModelOnlyError) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  const isQuotaExhausted = /resource_exhausted|quota_exhausted|exhausted.*capacity|capacity.*exhausted|quota.*reset|daily.*limit|limit reached/i.test(lowerErr);
  if (providerId === "antigravity" && isQuotaExhausted && model) {
    // A model quota error is always a durable model lock, even when the
    // upstream was wrapped in HTTP 502 or the generic fallback classifier
    // treated it as a transient 5xx.
    lockAll = false;
    shouldFallback = true;
    isExhausted = isAntigravityAccountQuotaExhausted(connectionId);
    newBackoffLevel = 0;
    cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  if (isModelSpecificRestriction && status !== 429) {
    lockAll = false;
    disableAccount = false;
  }

  // Antigravity uses 409 for quota/capacity exhaustion. Keep this provider-
  // specific so generic 409 conflicts remain terminal elsewhere.
  if (providerId === "antigravity" && status === 409) {
    const agQuota409 = /quota|capacity|resource exhausted|exhausted|rate.?limit|try again/i.test(lowerErr);
    if (agQuota409 || (resetsAtMs && resetsAtMs > Date.now())) {
      shouldFallback = true;
      cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs ? resetsAtMs - Date.now() : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
      lockAll = false;
    }
  }

  // Distributor "no available channel" (e.g. UniKey new_api distributor returns
  // HTTP 503 code model_not_found when no backend channel serves the model).
  // The model ID exists but the distributor is temporarily out of capacity —
  // NOT a dead account. Lock the model with a stable cooldown, fall back
  // immediately, and never disable the account. Without this, the generic
  // transient-5xx cooldown (seconds) hot-loops every account against a dead
  // channel.
  if (model && /no available channel|no healthy channel|all channels .* (busy|failed|unavailable|exhausted)|no channel .* available/i.test(lowerErr)) {
    shouldFallback = true;
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    newBackoffLevel = 0;
    cooldownMs = Math.max(cooldownMs || 0, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  // A quota snapshot can prove account-wide exhaustion even when the current
  // error names only one model. Re-read the hydrated snapshot after handling
  // the upstream signal so the durable connection status reflects reality.
  const readSnapshot = getLocalDbFn("getUsageSnapshotByConnectionId");
  const durableSnapshot = providerId === "antigravity" && readSnapshot
    ? await readSnapshot(connectionId).catch(() => null)
    : null;
  if (providerId === "antigravity" && (isAntigravityAccountQuotaExhausted(connectionId) || isAntigravityQuotaMapExhausted(durableSnapshot?.quotas))) {
    lockAll = true;
    isExhausted = true;
    shouldFallback = true;
    cooldownMs = Math.max(1000, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  // A positive quota snapshot cannot prove that an arbitrary requested model
  // is usable. A quota/capacity error for that model is therefore always a
  // durable 24-hour model lock, while account-wide exhaustion remains distinct.
  if (providerId === "antigravity" && isQuotaExhausted && model && !isExhausted) {
    lockAll = false;
    shouldFallback = true;
    cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, cooldownMs || 0);
  }


  // Fatal auth/account failure: permanently disable connection from routing
  if ((disableAccount || isFatalAuthError(status, errorText)) && !opencodeZenModelOnlyError) {
    const reason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Account authentication fatal error");
    const validationData = extractValidationUrl(reason);
    await updateProviderConnection(connectionId, {
      isActive: false,
      testStatus: "disabled",
      previousStatus: conn?.testStatus || "active",
      disabledReason: reason,
      disabledAt: new Date().toISOString(),
      disabledBy: "system",
      errorCode: status,
      lastErrorAt: new Date().toISOString(),
      backoffLevel: 0,
      modelLock___all: null,
      lockedAllUntil: null,
      rateLimitedUntil: null,
      lockedToModel: null,
      lockedToModelUntil: null,
      modelLocks: {},
      ...(validationData ? {
        providerSpecificData: {
          ...(conn?.providerSpecificData || {}),
          validationUrl: validationData.url,
          validationMessage: validationData.message,
          validationAt: new Date().toISOString(),
        },
      } : {}),
    });
    // Long L2 cooldown so the Redis-cached path also stops returning it
    redisSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${connName} account auth fatal error — DISABLED (is_active=false), removed from routing`);
    if (provider && status && reason) {
      console.error(`❌ ${provider} [${status}]: ${reason}`);
    }
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // OpenCode Zen uses 401 for workspace billing/model-entitlement failures.
  // These must not disable the API key: free models on the same account can
  // remain usable. Store a model-specific cooldown instead.
  if (!shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  const reason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Provider error");
  const isAccountWideLock = Boolean(lockAll || githubResetAtMs);
  const lockTargetModel = isAccountWideLock ? null : model;
  const lockUpdate = buildModelLockUpdate(lockTargetModel, cooldownMs);
  const lockExpiryIso = new Date(Date.now() + cooldownMs).toISOString();

  // Extract validation_url from VALIDATION_REQUIRED 403 responses (Antigravity/Google)
  const validationData = extractValidationUrl(reason);

  const resolvedTestStatus = is524Timeout
    ? (conn?.testStatus || "active")
    : isExhausted
      ? "exhausted"
      : (isAccountWideLock ? "unavailable" : (conn?.testStatus || "active"));

  // The account just proved itself unusable for this model: drop any
  // last-known-good pointer so the next selection re-scans instead of
  // fast-pathing straight back into the same dead account.
  delLkg(providerId, model).catch(() => {});

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    ...(isAccountWideLock ? { lockedAllUntil: lockExpiryIso } : {}),
    testStatus: resolvedTestStatus,
    lastError: is524Timeout ? (conn?.lastError || null) : reason,
    errorCode: is524Timeout ? null : status,
    lastErrorAt: is524Timeout ? (conn?.lastErrorAt || null) : new Date().toISOString(),
    backoffLevel: is524Timeout ? 0 : (newBackoffLevel ?? backoffLevel),
    ...(validationData ? {
      providerSpecificData: {
        ...(conn?.providerSpecificData || {}),
        validationUrl: validationData.url,
        validationMessage: validationData.message,
        validationAt: new Date().toISOString(),
      },
    } : {}),
  });

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  if (is524Timeout) {
    log.warn("AUTH", `${connName} temporary 524 gateway timeout (upstream slow/down) — transient fallback, no account error (cooldown ${Math.round(cooldownMs / 1000)}s)`);
  } else if (isExhausted) {
    log.warn("AUTH", `${connName} account quota/credits exhausted — LOCKED for ${Math.round(cooldownMs / (1000 * 3600 * 24))}d (status: exhausted) [${status}]`);
  } else {
    log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]`);
  }

  // Sync with Redis L2 Cooldown Layer
  const cooldownSecs = Math.ceil(cooldownMs / 1000);
  if (cooldownSecs > 0) {
    if (isAccountWideLock) {
      redisSetAccountCooldown(connectionId, cooldownSecs).catch(() => {});
    } else if (model) {
      redisSetModelCooldown(connectionId, model, cooldownSecs).catch(() => {});
    }
  }

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

/**
 * Clear account error status on successful request.
 * - Clears modelLock_${model} (the model that just succeeded)
 * - Lazy-cleans any other expired modelLock_* keys
 * - Resets error state only if no active locks remain
 * @param {string} connectionId
 * @param {object} currentConnection - credentials object (has _connection) or raw connection
 * @param {string|null} model - model that succeeded
 */
export async function clearAccountError(connectionId, currentConnection, model = null) {
  if (!connectionId || connectionId === "noauth") return;
  const conn = currentConnection._connection || currentConnection;
  const now = Date.now();
  const allLockKeys = Object.keys(conn).filter(k => k.startsWith("modelLock_"));

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  // Keys to clear: current model's lock + all expired locks
  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  if (keysToClear.length === 0 && conn.testStatus !== "unavailable" && !conn.lastError) return;

  // Check if any active locks remain after clearing
  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  // Reset testStatus to active if no account-wide lock (modelLock___all or lockedAllUntil) is active
  const hasActiveAccountLock = Boolean(
    (conn.modelLock___all && new Date(conn.modelLock___all).getTime() > now)
    || (conn.lockedAllUntil && new Date(conn.lockedAllUntil).getTime() > now)
    || (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > now)
  );
  if (!hasActiveAccountLock) {
    clearObj.testStatus = "active";
    clearObj.lockedAllUntil = null;
    clearObj.rateLimitedUntil = null;
    if (remainingActiveLocks.length === 0) {
      Object.assign(clearObj, {
        lastError: null,
        errorCode: null,
        lastErrorAt: null,
        backoffLevel: 0
      });
      if (conn?.providerSpecificData?.validationUrl) {
        const psd = { ...(conn.providerSpecificData || {}) };
        delete psd.validationUrl;
        delete psd.validationMessage;
        delete psd.validationAt;
        clearObj.providerSpecificData = psd;
      }
    }
    redisSetAccountCooldown(connectionId, 0).catch(() => {});
  }
  if (model) {
    redisSetModelCooldown(connectionId, model, 0).catch(() => {});
  }

  await updateProviderConnection(connectionId, clearObj);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check Anthropic x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key (optional - for local use can skip)
 */
export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}
