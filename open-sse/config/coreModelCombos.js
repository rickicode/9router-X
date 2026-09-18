// Core model families — the "default combo without alias" map.
//
// Canonical model name (bare, no provider prefix) → member bindings across
// providers. Requesting "glm-5.3-flash" routes through handleComboChat over
// these members (fallback + health-reorder + dead-member fast-skip already
// built). Seeded from the audit of healthy provider bindings (2026-09-19):
// per-provider members verified live or via recent traffic; dead members
// (freebuff 0/33, workbuddy credits exhausted, orca 429-locked, tokenrouter
// "no channel") are excluded.
//
// Dedupe rule matches canonicalModels.js: vendor prefixes (z-ai/, google/,
// deepseek/, …) and :free/:batch suffixes are stripped, so "glm-5.3-flash"
// collapses cline-free/z-ai/glm-5.3-flash + ocz/glm-5.3-flash, etc.

export const CORE_MODEL_COMBOS = {
  "glm-5.3-flash": [
    "cline-free/z-ai/glm-5.3-flash",
    "ocz/glm-5.3-flash",
  ],
  "glm-4.7-flash": [
    "cline-free/z-ai/glm-4.7-flash",
  ],
  "glm-4.5": [
    "cline-free/z-ai/glm-4.5",
  ],
  "deepseek-v4.1-flash": [
    "cline-free/deepseek/deepseek-v4.1-flash",
    "th/deepseek-v4.1-flash:free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
  ],
  "deepseek-v4-flash": [
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
    "orca/deepseek/deepseek-v4-flash-free",
  ],
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

export function getCoreComboMembers(canonicalName) {
  const key = String(canonicalName || "").replace(/[:^]free$/i, "").trim().toLowerCase();
  return CORE_MODEL_COMBOS[key] || null;
}