// OpenAI-compatible error types mapping (client-facing)
export const ERROR_TYPES = {
  400: { type: "invalid_request_error", code: "bad_request" },
  401: { type: "authentication_error", code: "invalid_api_key" },
  402: { type: "billing_error", code: "payment_required" },
  403: { type: "permission_error", code: "insufficient_quota" },
  404: { type: "invalid_request_error", code: "model_not_found" },
  406: { type: "invalid_request_error", code: "model_not_supported" },
  429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
  500: { type: "server_error", code: "internal_server_error" },
  502: { type: "server_error", code: "bad_gateway" },
  503: { type: "server_error", code: "service_unavailable" },
  504: { type: "server_error", code: "gateway_timeout" }
};

// Default error messages per status code (client-facing)
export const DEFAULT_ERROR_MESSAGES = {
  400: "Bad request",
  401: "Invalid API key provided",
  402: "Payment required",
  403: "You exceeded your current quota",
  404: "Model not found",
  406: "Model not supported",
  429: "Rate limit exceeded",
  500: "Internal server error",
  502: "Bad gateway - upstream provider error",
  503: "Service temporarily unavailable",
  504: "Gateway timeout"
};

// Exponential backoff config for rate limits
export const BACKOFF_CONFIG = {
  base: 2000,
  max: 5 * 60 * 1000,
  maxLevel: 15
};

// Default cooldown for transient/unknown errors
export const TRANSIENT_COOLDOWN_MS = 30 * 1000;

// Hard cap for provider-reported rate limit cooldown (defaults to 7 days for long upstream reset windows)
export const MAX_RATE_LIMIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Maximum number of accounts to attempt per request before giving up (prevents hammering hundreds of accounts)
export const MAX_FALLBACK_ATTEMPTS = 10;

// Cooldown durations (ms)
const COOLDOWN = {
  permanentAuth: 3 * 24 * 60 * 60 * 1000, // 3 days for auth/permission/ineligible errors
  quotaExhausted: 24 * 60 * 60 * 1000,    // 24 hours max for quota/credit exhaustion
  long: 2 * 60 * 1000,
  short: 5 * 1000,
};

/**
 * Unified error classification rules.
 * Checked top-to-bottom: text rules first (by order), then status rules.
 * Each rule: { text?, status?, cooldownMs?, backoff?, lockAll? }
 *   - text: substring match (case-insensitive) on error message
 *   - status: HTTP status code match
 *   - cooldownMs: fixed cooldown duration
 *   - backoff: true = use exponential backoff (rate limit)
 *   - lockAll: true = account-level lock (all models on this account locked)
 */
export const ERROR_RULES = [
  // --- Text-based rules (checked first, order = priority) ---
  // Content filter / safety review errors (do NOT lock account or model)
  { text: "did not pass the safety review",        cooldownMs: 0, lockAll: false, shouldFallback: false },
  { text: "safety review",                         cooldownMs: 0, lockAll: false, shouldFallback: false },
  { text: "request illegal",                       cooldownMs: 0, lockAll: false, shouldFallback: false },
  { text: "content filter",                        cooldownMs: 0, lockAll: false, shouldFallback: false },

  // Credit / Balance exhaustion (Account-wide lock until refill, max 24 hours)
  { text: "credits exhausted",                     cooldownMs: COOLDOWN.quotaExhausted, lockAll: true },
  { text: "insufficient credits",                  cooldownMs: COOLDOWN.quotaExhausted, lockAll: true },
  { text: "insufficient balance",                  cooldownMs: COOLDOWN.quotaExhausted, lockAll: true },
  { text: "out of credits",                        cooldownMs: COOLDOWN.quotaExhausted, lockAll: true },
  { text: "quota reached",                         cooldownMs: COOLDOWN.quotaExhausted, lockAll: true },

  // Model-level restrictions (do NOT lock other models on the same account)
  { text: "not available on the workers free plan", cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "upgrade to access this model",          cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "plan does not include",                 cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "not supported for your plan",           cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "model not supported for tier",          cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "not available in your region",  cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: "country_blocked",                cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  // OpenRouter & generic model gating (agentic harness gate, routing funnel, model-specific access)
  { text: "only available on agentic harnesses",   cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "agentic harness",                       cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "gate free endpoints",                   cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "failed_routing_step",                   cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "routing_funnel",                        cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "is only available",                     cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "only available on",                     cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "only available to",                     cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "only accessible to",                    cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "model is not available",                cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "model not available",                   cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "endpoint is not available",             cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "not allowed for this model",            cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "model is not allowed",                  cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "model is restricted",                   cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "requires a paid",                       cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  { text: "requires a subscription",               cooldownMs: COOLDOWN.quotaExhausted, lockAll: false },
  // Freebuff proxy-egress refusal (NOT an account fault): the proxy IP is
  // anonymous/blocked, so the pool must rotate — never lock the account.
  // Must stay ABOVE the "session request failed: 403" and status-403 rules.
  { text: "free_mode_unavailable",           cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: "anonymous_network",              cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: "rotating proxy",                 cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },

  // Connect timeout errors: transient 15s cooldown, never lock account or disable
  { text: "fetch connect timeout",           cooldownMs: 15 * 1000, lockAll: false, disableAccount: false },
  { text: "connect timeout",                 cooldownMs: 15 * 1000, lockAll: false, disableAccount: false },
  { text: "connection timeout",              cooldownMs: 15 * 1000, lockAll: false, disableAccount: false },

  { text: "invalid authentication credential",   cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "invalid_grant",                       cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "invalid_api_key",                     cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "invalid api key",                     cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "unauthenticated",                     cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "unrecoverable_refresh_error",         cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "refresh_token_reused",                cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "account has been banned",             cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "account has been deleted",            cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "account suspended",                   cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "user has been suspended",             cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "banned",                              cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "suspended",                           cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "token revoked",                       cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "unauthorized",                        cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "validation_required",                 cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "not eligible",              cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "session request failed: 403", cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "permission_denied",         cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "permission denied",         cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "no credentials",            cooldownMs: COOLDOWN.long },
  { text: "request not allowed",       cooldownMs: COOLDOWN.short },
  { text: "improperly formed request",  cooldownMs: COOLDOWN.long },
  // Freebuff limited tier rate limit on proxy IP: transient cooldown (30s), do NOT lock account
  { text: '"accesstier":"limited"', cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: 'accesstier: "limited"', cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: '"pool":"freebucks"', cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: "limited tier rate limited on this proxy", cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },
  { text: "rate limit",                backoff: true },
  { text: "too many requests",         backoff: true },
  { text: "quota exceeded",            backoff: true },
  { text: "quota_exhausted",           backoff: true },
  { text: "resource_exhausted",        backoff: true },
  // MODEL_CAPACITY_EXHAUSTED (antigravity 503): no upstream reset time exists,
  // lock just the affected model long enough to stop retry-storming (15m),
  // account stays usable for other models.
  { text: "model_capacity_exhausted", cooldownMs: 15 * 60 * 1000, lockAll: false },
  { text: "no capacity available for model", cooldownMs: 15 * 60 * 1000, lockAll: false },
  { text: "capacity",                  backoff: true },
  { text: "overloaded",                backoff: true },

  // --- Status-based rules (fallback when text doesn not match) ---
  // 4xx request errors (400/404/413) are request-level, not account-level:
  // the account itself is healthy; only the request was bad. Do NOT lock.
  { status: 400, cooldownMs: 0, lockAll: false, shouldFallback: false },
  { status: 404, cooldownMs: 0, lockAll: false, shouldFallback: false },
  { status: 413, cooldownMs: 0, lockAll: false, shouldFallback: false },
  // Auth errors — the account/token is dead or forbidden
  { status: 401, cooldownMs: 0, lockAll: true, disableAccount: true },
  { status: 402, cooldownMs: COOLDOWN.long },
  { status: 403, cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  // Rate limit — backoff
  { status: 429, backoff: true },
];

// Backward compat: COOLDOWN_MS object (used by index.js re-export)
export const COOLDOWN_MS = {
  unauthorized: COOLDOWN.long,
  paymentRequired: COOLDOWN.long,
  notFound: COOLDOWN.long,
  transient: TRANSIENT_COOLDOWN_MS,
  requestNotAllowed: COOLDOWN.short,
};
