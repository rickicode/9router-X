export default {
  id: "unikey",
  priority: 120,
  alias: "unikey",
  aliases: ["uk"],
  uiAlias: "uk",
  display: {
    name: "UniKey",
    icon: "key",
    color: "#2563EB",
    textIcon: "UK",
    website: "https://www.getunikey.ai",
    notice: {
      text: "Unified AI API gateway (OpenAI-compatible). Add your UniKey API key.",
      apiKeyUrl: "https://www.getunikey.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://www.getunikey.ai/v1/chat/completions",
    thinkingFormat: "openai",
  },
  models: [],
  passthroughModels: true,
  features: {
    usage: true,
    usageApikey: true,
  },
};