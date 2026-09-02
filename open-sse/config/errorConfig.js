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

// Cooldown durations (ms)
const COOLDOWN = {
  permanentAuth: 30 * 60 * 1000, // 30 mins for auth/permission/ineligible errors
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
  { text: "not eligible",              cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "permission_denied",         cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "permission denied",         cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "unauthenticated",           cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "unauthorized",              cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "invalid_api_key",           cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "invalid api key",           cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { text: "no credentials",            cooldownMs: COOLDOWN.long },
  { text: "request not allowed",       cooldownMs: COOLDOWN.short },
  { text: "improperly formed request",  cooldownMs: COOLDOWN.long },
  { text: "rate limit",                backoff: true },
  { text: "too many requests",         backoff: true },
  { text: "quota exceeded",            backoff: true },
  { text: "quota_exhausted",           backoff: true },
  { text: "resource_exhausted",        backoff: true },
  { text: "capacity",                  backoff: true },
  { text: "overloaded",                backoff: true },

  // --- Status-based rules (fallback when text doesn't match) ---
  { status: 401, cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { status: 402, cooldownMs: COOLDOWN.long },
  { status: 403, cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  { status: 404, cooldownMs: COOLDOWN.long },
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
