// Core model families — the "default combo without alias" map.
//
// Canonical model name (bare, no provider prefix) → member bindings across
// built-in providers ONLY (user-defined provider nodes are never referenced).
// Requesting "glm-5.3-flash", "deepseek-flash-latest", "gemini-pro-latest",
// "gpt-latest", … routes through handleComboChat over the member list
// (fallback + health-reorder + dead-member fast-skip already built).
//
// Seeded from the audit of healthy provider bindings (2026-09-19): every
// member below was verified live or via recent traffic. Dead members
// (freebuff 0/33, workbuddy credits exhausted, orca 429-locked, tokenrouter
// "no channel") are excluded.
//
// General "-latest" combos track each family's newest healthy model and stay
// alias-free so a client can ask for "claude-latest" / "gemini-pro-latest"
// without knowing/versioning a specific id. Bump the version when a provider
// ships a newer generation — never point a -latest entry at a dead binding.

export const CORE_MODEL_COMBOS = {
  // ── GLM family (only the newest generation is seeded; older GLM versions
  //    like 4.5 / 4.7 are not worth seed space) ──────────────────────────
  "glm-5.3-flash": [
    "cline-free/z-ai/glm-5.3-flash",
    "ocz/glm-5.3-flash",
  ],

  // ── DeepSeek family ───────────────────────────────────────────────────
  "deepseek-v4.1-flash": [
    "cline-free/deepseek/deepseek-v4.1-flash",
    "th/deepseek-v4.1-flash:free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
  ],
  "deepseek-v4-flash": [
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
    "orca/deepseek/deepseek-v4-flash-free",
  ],
  "deepseek-v4-pro": [
    "uk/deepseek/deepseek-v4-pro",
    "th/deepseek-v4.1-flash:free",
  ],

  // ── Other families ────────────────────────────────────────────────────
  "mimo-v2.5": [
    "oc/mimo-v2.5-free",
    "ocz/mimo-v2.5-free",
    "th/mimo-v2.5:free",
  ],
  "gpt-5.6-luna": [
    "cx/gpt-5.6-luna",
    "uk/gpt-5.6-luna",
  ],
  "claude-haiku-4-5": [
    "uk/claude-haiku-4-5-20251001",
  ],
  "gemini-3.8-flash": [
    "ag/gemini-3.8-flash-high",
    "ag/gemini-3.8-flash-medium",
  ],
  "muse-spark": [
    "oc/muse-spark-1.3-contributor-free",
    "oc/muse-spark-1.2-contributor-free",
  ],
};

// General ("no version") combos: newest healthy model per family, alias-free.
export const GENERAL_LATEST_COMBOS = {
  "gemini-flash-latest": [
    "ag/gemini-3.8-flash-high",
    "ag/gemini-3.8-flash-medium",
  ],
  "gemini-pro-latest": [
    "ag/gemini-3.1-pro-low",
    "uk/google/gemini-3.1-pro-preview",
  ],
  "claude-latest": [
    "uk/claude-opus-4-8",
    "ag/claude-opus-4-6-thinking",
  ],
  "glm-latest": [
    "cline-free/z-ai/glm-5.3-flash",
    "ocz/glm-5.3-flash",
  ],
  "deepseek-flash-latest": [
    "cline-free/deepseek/deepseek-v4.1-flash",
    "th/deepseek-v4.1-flash:free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
  ],
  "deepseek-pro-latest": [
    "uk/deepseek/deepseek-v4-pro",
    "th/deepseek-v4.1-flash:free",
  ],
  "gpt-latest": [
    "cx/gpt-5.6-luna",
    "uk/gpt-5.6-luna",
  ],
  // Frontier open-weight coding models — only bindings that PASSED a live
  // code-execution benchmark (2026-09-19: sort-evens + fibonacci ran &
  // returned correct output). nemotron-ultra-550b FAILED execution (garbled
  // code) and nemotron-super/nemotron-3.5-leak reasoning text — excluded.
  "open-weight-latest": [
    "cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "cline-free/google/gemma-4-31b-it:free",
    "cline-free/nex-agi/nex-n2.5-pro:free",
    "cline-free/poolside/laguna-s-2.1:free",
  ],
};

export function getCoreComboMembers(canonicalName) {
  const key = String(canonicalName || "").replace(/[:^]free$/i, "").trim().toLowerCase();
  return CORE_MODEL_COMBOS[key] || GENERAL_LATEST_COMBOS[key] || null;
}

export function isGeneralLatestCombo(name) {
  return Object.prototype.hasOwnProperty.call(GENERAL_LATEST_COMBOS, String(name || ""));
}