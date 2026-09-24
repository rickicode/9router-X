// Canonical external-config identity for the gateway, written into third-party
// CLI tool configs (Codex config.toml, OpenCode config.json, ...).
//
// "axonrouter" is the current name; "9router" is the legacy name kept ONLY for
// reading: machines configured before the AxonRouter rebrand must keep being
// detected and cleanly migrated on the next Apply. Never write "9router" to new
// configs.

export const PROVIDER_ID = "axonrouter";
export const LEGACY_PROVIDER_IDS = ["9router"];
export const PROVIDER_IDS = [PROVIDER_ID, ...LEGACY_PROVIDER_IDS];

export const PROVIDER_DISPLAY_NAME = "AxonRouter";

// Placeholder key written for localhost setups (auth bypassed on loopback).
// The legacy value is accepted when reading configs so old setups still detect.
export const DEFAULT_LOCAL_API_KEY = "sk_axonrouter";
export const LEGACY_DEFAULT_LOCAL_API_KEY = "sk_9router";

/** True when `value` is either the current or a legacy provider identifier. */

/** Pick the gateway provider entry from a provider map under any known id. */
export function pickRouterProvider(map) {
  if (!map) return null;
  for (const id of PROVIDER_IDS) if (map[id]) return map[id];
  return null;
}
export function isRouterProviderId(value) {
  return value === PROVIDER_ID || LEGACY_PROVIDER_IDS.includes(value);
}

/** Placeholder key: prefer a real key, else the current local default. */
export function resolveLocalApiKey(apiKey) {
  return apiKey || DEFAULT_LOCAL_API_KEY;
}

const MODEL_PREFIX_RE = new RegExp(`^(${PROVIDER_IDS.join("|")})/`);

/** True when a model id is namespaced under a gateway provider id (current or legacy). */
export function isRouterModelId(id) {
  return typeof id === "string" && MODEL_PREFIX_RE.test(id);
}

/** "9router/foo" / "axonrouter/foo" -> "foo". */
export function stripRouterModelPrefix(id) {
  return typeof id === "string" ? id.replace(MODEL_PREFIX_RE, "") : id;
}

/** Build the namespaced model id for writing (always the current id). */
export function routerModelId(model) {
  return `${PROVIDER_ID}/${model}`;
}
