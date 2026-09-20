/**
 * Account exhaustion policy.
 *
 * Semantic definition:
 * "exhausted" (testStatus = "exhausted") is a TERMINAL state where EVERY model
 * on the account is unusable because global credits / pooled quota have hit zero.
 *
 * In contrast:
 * - Model-specific rate limits / quota hits are "modelLock" (transient, testStatus stays active).
 * - Timed account-wide caps (daily/monthly limits that reset at a known time) ride a
 *   temporary account lock (testStatus = "unavailable"), NOT "exhausted".
 * - Free-tier providers whose free models continue to serve even after paid credits run out
 *   must NEVER have testStatus = "exhausted".
 */

import {
  isAntigravityAccountQuotaExhausted,
  isAntigravityQuotaMapExhausted,
} from "./antigravityQuota.js";

// Providers whose free models keep serving after paid credits die, or whose
// quota resets on a timer — must never carry account-level "exhausted".
export const NEVER_ACCOUNT_EXHAUSTED_PROVIDERS = new Set([
  // registry category "free" (free-only pools)
  "devin-cli",
  "freebuff",
  "gemini-cli",
  "opencode",
  "kiro",
  "mimo-free",

  // registry category "freeTier" — except cloudflare-ai, whose daily neuron
  // budget is pooled across every model (true account-wide exhaustion)
  "coqui",
  "searxng",
  "byteplus",
  "api-airforce",
  "edge-tts",
  "kimchi",
  "vertex",
  "nvidia",
  "tortoise",
  "kilo-gateway",
  "bazaarlink",
  "local-device",
  "gemini",
  "ollama",
  "google-tts",
  "poolside",
  "openrouter",

  // free models survive paid-credit death / model-scoped billing
  "cline",
  "cline-free",
  "kilocode",
  "opencode-zen",
  "bai",

  // timed recovery (monthly cap) -> "unavailable", never terminal
  "github",
]);

/**
 * Check if a provider can ever have an account marked as "exhausted".
 *
 * @param {string|null} providerId
 * @returns {boolean}
 */
export function providerAllowsAccountExhausted(providerId) {
  if (!providerId) return false;
  return !NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has(providerId);
}

const CREDIT_QUOTA_RE =
  /credit|balance|insufficient|exhaust|deplet|billing|payment|quota|allocation|neurons|预扣费额度失败|剩余额度|额度不足/i;

/**
 * Check if the error message reflects depleted credits/quota.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isCreditQuotaErrorText(text) {
  return CREDIT_QUOTA_RE.test(String(text || ""));
}

/**
 * Check whether an account is truly exhausted globally across all models.
 *
 * @param {string} connectionId
 * @param {string} providerId
 * @param {object|null} snapshot
 * @returns {boolean}
 */
export function isAccountFullyExhausted(connectionId, providerId, snapshot = null) {
  if (!providerId || !providerAllowsAccountExhausted(providerId)) {
    return false;
  }

  if (providerId === "antigravity") {
    return (
      isAntigravityAccountQuotaExhausted(connectionId) ||
      Boolean(snapshot && isAntigravityQuotaMapExhausted(snapshot.quotas))
    );
  }

  // Non-antigravity providers that allow exhaustion (e.g. unikey, codebuddy, cloudflare-ai)
  // are evaluated via error rules and snapshot status in caller.
  return false;
}
