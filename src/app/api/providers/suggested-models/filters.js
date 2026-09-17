// Free OpenCode models that don't use the "-free" id suffix.
// union-alpha is served via the Claude transport (/zen/v1/messages —
// reverse-engineered from the genuine CLI 1.18.31, 2026-09-17), NOT
// /chat/completions (500s there). Gateway routes it per registry
// targetFormat:"claude".
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle", "union-alpha"];

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
