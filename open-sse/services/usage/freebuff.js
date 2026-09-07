/**
 * Freebuff usage handler
 *
 * Freebuff has no separate billing/quota API — the daily free/premium session
 * quota lives on the session endpoint itself. Reading it MUST use
 * GET /api/v1/freebuff/session (the CLI's status poll): POST would CLAIM a
 * session and burn 1.0 unit of the daily quota, which a quota tracker must
 * never do.
 *
 * The GET response carries the shared session quota as `rateLimitsByModel`,
 * keyed by model id, on the pre-join (`none`), `active`, and `ended` states:
 *   { limit, recentCount, resetAt, period: 'pacific_day'|'pacific_week',
 *     resetTimeZone, entitlementBreakdown? }
 * `recentCount` is fractional — a long agent run can consume 1.3 units — and
 * includes the active session's own 1.0-unit reservation. `limit` can be
 * raised by referral/streak rewards (entitlementBreakdown.base + referral +
 * streak).
 */

import REGISTRY from "../../providers/registry/index.js";
import { U, fetchWithTimeout } from "./shared.js";
import { getCodebuffUserAgent } from "../freebuffVersion.js";
import { canonicalFreebuffModel } from "../../executors/freebuff.js";
// Friendly labels from the registry model list (mirrors the CLI picker).
const freebuffRegistry = REGISTRY.find((r) => r.id === "freebuff") || {};
const MODEL_LABELS = Object.fromEntries(
  (freebuffRegistry.models || []).map((m) => [m.id, m.name]),
);

// Live quota cache per connection (mirrors antigravityQuota.js): warmed by the
// dashboard usage fetch and by 403/429 chat responses, read by the account
// pre-filter in src/sse/services/auth.js so an exhausted account is skipped
// before any upstream call. Lives on globalThis so Next dev (Turbopack) keeps
// ONE copy across bundles.
const FB_QUOTA_STATE_KEY = "__9routerFreebuffQuota__";
const quotaCache = (globalThis[FB_QUOTA_STATE_KEY] ??= new Map()); // connectionId -> { [model]: quotaRow, __fetchedAt }

/** Read-only handle for the auth pre-filter. */
export function getFreebuffQuotaCache() {
  return quotaCache;
}

/**
 * Refresh a single connection's freebuff quota from upstream (GET /session —
 * never POSTs, so no session is claimed and no quota is burned).
 * @returns {Promise<Object|null>} model -> { used, total, remaining, resetAt, unlimited } map, or null.
 */
export async function refreshFreebuffQuota(connectionId, accessToken, providerSpecificData, proxyOptions = null) {
  if (!connectionId) return null;
  const usage = await getFreebuffUsage(accessToken, providerSpecificData, proxyOptions, connectionId);
  return usage?.quotas || null;
}

/**
 * Verify the true account status via direct egress (no proxy).
 * Proxy-egress refusals (free_mode_unavailable / anonymous_network) mask the
 * real account state (banned / rate_limited). GET /session never claims a
 * session, so this check burns no quota.
 * @returns {Promise<"banned"|"active"|"quota"|"unknown">}
 */
export async function verifyFreebuffAccountDirect(accessToken) {
  if (!accessToken) return "unknown";
  try {
    const response = await fetchWithTimeout(
      sessionUrl(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": getCodebuffUserAgent(),
          Accept: "application/json",
        },
      },
      15000,
      // Direct egress intentionally: proxies are known-flagged as
      // anonymous_network, `vercelRelayUrl: ""` prevents relay rewrite
      // and `noFitPool: true` opts out of any pool binding.
      {
        connectionProxyEnabled: false,
        connectionProxyUrl: "",
        vercelRelayUrl: "",
        proxyPoolId: null,
        noFitPool: true,
      },
    );

    const body = await response.json().catch(() => ({}));
    if (response.status === 401) return "unknown";
    if (body?.status === "banned") return "banned";
    if (body?.status === "country_blocked") return "unknown";
    if (body?.status === "rate_limited") return "quota";
    if (response.ok) return "active";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * After a 403/429 chat/session error, refresh the quota and return the exact
 * resetAt (ms) for the failed model so the account lock runs until the real
 * Pacific-day/week reset instead of an exponential backoff.
 */
export async function handleFreebuffQuotaError(connectionId, model, accessToken, providerSpecificData, proxyOptions = null) {
  try {
    const canonical = canonicalFreebuffModel(model);
    const quotas = await refreshFreebuffQuota(connectionId, accessToken, providerSpecificData, proxyOptions);
    const resetAt = quotas?.[canonical]?.resetAt || quotas?.[model]?.resetAt;
    if (!resetAt) return null;
    const ms = new Date(resetAt).getTime();
    return Number.isFinite(ms) && ms > Date.now() ? ms : null;
  } catch {
    return null;
  }
}
function sessionUrl() {
  return U("freebuff").url;
}

export async function getFreebuffUsage(accessToken, providerSpecificData, proxyOptions = null, connectionId = null) {
  if (!accessToken) {
    return { message: "Freebuff credential not available — connect a Freebuff login first." };
  }

  try {
    const response = await fetchWithTimeout(
      sessionUrl(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": getCodebuffUserAgent(),
          Accept: "application/json",
        },
      },
      15000,
      proxyOptions,
    );

    if (response.status === 401) {
      return { message: "Freebuff credential invalid or expired — re-login in the dashboard." };
    }
    if (response.status === 403) {
      // A 403 from the session endpoint is usually a server-side gate status
      // (country_blocked / banned), not a credential problem — telling the
      // user to re-login would be misleading (mirrors the CLI's
      // callFreebuffSession 403 branch).
      const body = await response.json().catch(() => ({}));
      if (body?.status === "country_blocked") {
        return { message: "Freebuff is not available in your region." };
      }
      if (body?.status === "banned") {
        return { message: "Your Freebuff account has been banned." };
      }
      return {
        message: `Freebuff quota access denied (403)${body?.message ? `: ${body.message}` : ""}.`,
      };
    }
    // 404 = no session row at all → pre-join state, no quota to report.
    if (response.status === 404) {
      return { plan: "Freebuff", message: "Freebuff connected. No session quota to report right now." };
    }
    if (!response.ok) {
      return { message: `Freebuff quota API error (${response.status}).` };
    }

    const data = await response.json().catch(() => ({}));
    const rateLimits = { ...(data.rateLimitsByModel || {}) };
    // An active session carries its own `rateLimit` row — fold it in when the
    // shared map omits the model (older servers).
    if (data.status === "active" && data.rateLimit && !rateLimits[data.model]) {
      rateLimits[data.model] = data.rateLimit;
    }

    const quotas = {};
    for (const [model, rl] of Object.entries(rateLimits)) {
      if (!rl || typeof rl !== "object") continue;
      const used = Number(rl.recentCount);
      const total = Number(rl.limit);
      const usedFinite = Number.isFinite(used) ? used : 0;
      // A missing/zero limit means the model is unmetered on this account
      // (MiMo / DeepSeek V4 Flash / GLM 5.3 Flash / Solar Pro 4) — show it as
      // Unlimited instead of a misleading "0 of 0" bar.
      const limited = Number.isFinite(total) && total > 0;
      quotas[model] = {
        used: usedFinite,
        total: limited ? total : 0,
        remaining: limited ? Math.max(0, Math.round((total - usedFinite) * 100) / 100) : null,
        resetAt: rl.resetAt || null,
        unlimited: !limited,
        // Daily/weekly Pacific session allowance replenishes at resetAt — the
        // UI must say "Resets in", not "Expires in".
        recurring: true,
        period: rl.period || null,
        ...(MODEL_LABELS[model] ? { displayName: MODEL_LABELS[model] } : {}),
      };
    }

    if (connectionId) {
      quotaCache.set(connectionId, { ...quotas, __fetchedAt: Date.now() });
    }

    const plan = data.accessTier === "limited" ? "Freebuff (Limited)" : "Freebuff";
    if (Object.keys(quotas).length === 0) {
      return { plan, message: "Freebuff connected. No session quota to report right now." };
    }
    return { plan, quotas };
  } catch (error) {
    return { message: `Freebuff usage error: ${error.message}` };
  }
}

export default getFreebuffUsage;
