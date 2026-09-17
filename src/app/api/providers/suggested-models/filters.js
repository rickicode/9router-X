// Free OpenCode models that don't use the "-free" id suffix.
// NOTE: "union-alpha" is listed by upstream /zen/v1/models but returns
// HTTP 500 on both /zen/v1/chat/completions and /zen/v1/responses
// (verified 2026-09-17) — do NOT re-add until upstream serves it.
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle"];

// Upstream returns "Model is unavailable" for this id (2026-09-02) — re-enable when fixed
const DEAD_FREE_OPENCODE_MODELS = new Set(["deepseek-v4-flash-free"]);

export const FILTERS = {
  "openai": (models) =>
    (Array.isArray(models) ? models : [])
      .map((m) => ({ id: m.id || m.name, name: m.name || m.id, contextLength: m.context_length }))
      .filter((m) => Boolean(m.id)),

  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": (models) =>
    models
      .filter((m) => (m.id?.endsWith("-free") || KNOWN_FREE_OPENCODE_MODELS.includes(m.id)) && !DEAD_FREE_OPENCODE_MODELS.has(m.id))
      .map((m) => ({ id: m.id, name: m.id })),

  "orcarouter-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter(
        (m) =>
          (m.pricing?.prompt === "0" && m.pricing?.completion === "0") ||
          m.id?.includes(":free") ||
          m.id?.endsWith("-free") ||
          m.name?.toLowerCase().includes("free")
      )
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length })),

  // models.dev returns large catalog; keep only mimo models
  "mimo-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m.id?.startsWith("mimo") || m.name?.toLowerCase().includes("mimo"))
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  "airforce-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => (m.tier === "free" || m.id?.endsWith(":free")) && m.supports_chat === true && (!m.media_type || m.media_type === "chat" || m.media_type === "text"))
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
};
