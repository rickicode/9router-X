export default {
  id: "vlmrun-free",
  priority: 46,
  hasFree: true,
  alias: "vlmrf",
  aliases: [
    "vlmrun-free",
    "vlm-free",
    "vrf",
  ],
  uiAlias: "vlmrf",
  display: {
    name: "VLM Run Free",
    icon: "visibility",
    color: "#6366F1",
    textIcon: "VR",
    website: "https://vlm.run",
    notice: {
      text: "Vision-language model gateway. Anonymous: 10 RPM, 30/hr, 100/day per IP. Free API key available at app.vlm.run.",
    },
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://gateway.vlm.run/v1/openai/chat/completions",
    noAuth: true,
  },
  models: [
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", contextLength: 262144, reasoning: true, vision: true },
  ],
  modelsFetcher: { url: "https://gateway.vlm.run/v1/openai/models", type: "vlmrun-free" },
  passthroughModels: true,
};
