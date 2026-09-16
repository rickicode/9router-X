// Core model families — the "default combo without alias" map.
//
// Canonical model name (bare, no provider prefix) → member bindings across
// built-in providers ONLY (user-defined provider nodes are never referenced).
// Requesting "deepseek-v4-flash", "deepseek-flash-latest", "mimo-latest", …
// routes through handleComboChat over the member list
// (fallback + health-reorder + dead-member fast-skip already built).
//
// Seeded from the audit of healthy provider bindings (2026-09-19): every
// member below was verified live or via recent traffic. Dead members
// (freebuff 0/33, workbuddy credits exhausted, orca 429-locked, tokenrouter
// "no channel") are excluded.
//
// General "-latest" combos track each family's newest healthy model and stay
// alias-free so a client can ask for "claude-latest" / "mimo-latest"
// without knowing/versioning a specific id. Bump the version when a provider
// ships a newer generation — never point a -latest entry at a dead binding.
//
// Retired 2026-09-21 (combo cleanup): glm-5.3-flash → glm-latest,
// deepseek-v4.1-flash (as combo name) → deepseek-flash-latest,
// mimo-v2.5 → mimo-latest, gpt-5.6-luna → gpt-latest,
// claude-haiku-4-5 → claude-latest, gemini-3.8-flash → gemini-flash-latest,
// muse-spark → muse-spark-latest, smart-model removed.

export const CORE_MODEL_COMBOS = {
  // ── DeepSeek family ───────────────────────────────────────────────────
  "deepseek-v4-flash": [
    "cline-free/deepseek/deepseek-v4.1-flash",
    "uk/deepseek/deepseek-v4-flash",
    "th/deepseek-v4.1-flash:free",
    "cline-free/deepseek/deepseek-v4-flash-0731:free",
    "kilocode/deepseek/deepseek-chat",
    "kilocode/kilo-auto/free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
  ],
  "deepseek-v4-pro": [
    "uk/deepseek/deepseek-v4-pro",
    "th/deepseek-v4.1-flash:free",
    "cline-free/deepseek/deepseek-v4.1-flash",
    "kilocode/deepseek/deepseek-reasoner",
  ],
};

// General ("no version") combos: newest healthy model per family, alias-free.
export const GENERAL_LATEST_COMBOS = {
  "mimo-latest": [
    "mimo/mimo-v2.5",
    "mimo/mimo-v2.5-pro",
    "xmtp/mimo-v2.5",
    "bai/mimo-v2.5",
    "ocz/mimo-v2.5-free",
    "th/mimo-v2.5:free",
  ],
  "muse-spark-latest": [
    "oc/muse-spark-1.3-contributor-free",
    "ocz/muse-spark-1.3-contributor-free",
  ],
  "gemini-flash-latest": [
    "ag/gemini-3.8-flash-high",
    "ag/gemini-3.8-flash-medium",
    "ag/gemini-3.8-flash-low",
    "ag/gemini-3.7-flash-high",
    "ag/gemini-3.7-flash-medium",
    "ag/gemini-3.7-flash-low",
    "ag/gemini-3.6-flash-high",
    "ag/gemini-3.6-flash-medium",
    "ag/gemini-3.6-flash-low",
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
    "cline-free/z-ai/glm-5.2:free",
    "kilocode/z-ai/glm-5.2:free",
  ],
  "deepseek-flash-latest": [
    "cline-free/deepseek/deepseek-v4.1-flash",
    "uk/deepseek/deepseek-v4-flash",
    "th/deepseek-v4.1-flash:free",
    "cline-free/deepseek/deepseek-v4-flash-0731:free",
    "kilocode/deepseek/deepseek-chat",
    "kilocode/kilo-auto/free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
  ],
  "deepseek-pro-latest": [
    "uk/deepseek/deepseek-v4-pro",
    "th/deepseek-v4.1-flash:free",
    "cline-free/deepseek/deepseek-v4.1-flash",
    "kilocode/deepseek/deepseek-reasoner",
  ],
  "gpt-latest": [
    "cx/gpt-5.6-luna",
    "uk/gpt-5.6-luna",
  ],
  // Frontier open-weight coding models — every binding below PASSED a live
  // code-execution benchmark (2026-09-19/20). Combines Cline Free,
  // Kilo Code Free, OpenCode, and tested flagship open weights.
  "open-weight-latest": [
    "cline-free/z-ai/glm-5.3-flash",
    "cline-free/deepseek/deepseek-v4.1-flash",
    "kilocode/poolside/laguna-s-2.1:free",
    "kilocode/inclusionai/ling-3.0-flash-sante:free",
    "kilocode/inclusionai/ling-3.0-flash-fin:free",
    "kilocode/stepfun/step-3.7-flash:free",
    "oc/muse-spark-1.3-contributor-free",
    "cline-free/minimax/minimax-m3",
    "kilocode/cohere/north-mini-code:free",
    "kilocode/kilo-auto/free",
    "cline-free/google/gemma-4-31b-it:free",
    "cline-free/google/gemma-4-26b-a4b-it:free",
    "cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "cline-free/nex-agi/nex-n2.5-pro:free",
    "kilocode/nex-agi/nex-n2.5-mini:free",
    "kilocode/dots-studio/dots-3-note-preview:free",
  ],
};

export function getCoreComboMembers(canonicalName) {
  const key = String(canonicalName || "").replace(/[:^]free$/i, "").trim().toLowerCase();
  return CORE_MODEL_COMBOS[key] || GENERAL_LATEST_COMBOS[key] || null;
}

export function isGeneralLatestCombo(name) {
  return Object.prototype.hasOwnProperty.call(GENERAL_LATEST_COMBOS, String(name || ""));
}
