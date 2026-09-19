import { CLAUDE_API_HEADERS } from "../shared.js";

export default {
  id: "morphllm",
  alias: "morphllm",
  aliases: ["mrp", "morph"],
  uiAlias: "mrp",
  display: {
    name: "MorphLLM",
    icon: "change_history",
    color: "#14B8A6",
    textIcon: "MP",
    website: "https://morphllm.com",
    notice: { apiKeyUrl: "https://morphllm.com" },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.morphllm.com/v1/chat/completions",
    validateUrl: "https://api.morphllm.com/v1/models",
  },
  transports: [
    {
      format: "openai",
      baseUrl: "https://api.morphllm.com/v1/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
    {
      format: "claude",
      baseUrl: "https://api.morphllm.com/v1/messages",
      headers: { ...CLAUDE_API_HEADERS },
      auth: { combined: true, header: "x-api-key", scheme: "raw" },
    },
  ],
  models: [
    { id: "morph-dsv41flash", name: "DeepSeek V4.1 Flash (MorphLLM)", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-kimik3", name: "Kimi K3 2.8T (MorphLLM)", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-kimik3-fast", name: "Kimi K3 Fast (MorphLLM)", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-glm53-744b", name: "GLM-5.3 744B (MorphLLM)", contextLength: 1048576, reasoning: true },
    { id: "morph-glm53flash", name: "GLM-5.3-Flash (MorphLLM)", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-dsv4flash", name: "DeepSeek V4 Flash 0731 (MorphLLM)", contextLength: 1048576, reasoning: true },
    { id: "morph-dsv4flash-0731", name: "DeepSeek V4 Flash 0731 (MorphLLM)", contextLength: 1048576, reasoning: true },
    { id: "morph-v3-fast", name: "MorphLLM v3 Fast Apply", contextLength: 262144 },
    { id: "morph-v3-large", name: "MorphLLM v3 Large Apply", contextLength: 262144 },
    { id: "morph-compactor", name: "MorphLLM Context Compactor", contextLength: 1048576 },
    { id: "auto", name: "MorphLLM Auto Router", contextLength: 1048576 },
  ],
};
