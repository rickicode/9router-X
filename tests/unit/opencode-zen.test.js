import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS, getDefaultModel, getModelSupportedFormats, getModelTargetFormat } from "../../open-sse/config/providerModels.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen.js";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";

describe("OpenCode Zen provider registry", () => {
  it("registers opencode-zen with apikey category and aliases", () => {
    const entry = REGISTRY.find((e) => e.id === "opencode-zen");
    expect(entry).toBeDefined();
    expect(entry.id).toBe("opencode-zen");
    expect(entry.alias).toBe("opencode-zen");
    expect(entry.aliases).toContain("zen");
    expect(entry.aliases).toContain("ocz");
    expect(entry.display.name).toBe("OpenCode Zen");
    expect(entry.category).toBe("apikey");
    expect(entry.passthroughModels).toBe(true);
    expect(entry.modelsFetcher.url).toBe("https://opencode.ai/zen/v1/models");

    expect(resolveProviderAlias("opencode-zen")).toBe("opencode-zen");
    expect(resolveProviderAlias("zen")).toBe("opencode-zen");
    expect(resolveProviderAlias("ocz")).toBe("opencode-zen");
  });

  it("declares openai / claude / openai-responses transports on zen/v1", () => {
    const transports = PROVIDERS["opencode-zen"].transports || [];
    expect(transports.map((t) => t.format)).toEqual(["openai", "claude", "openai-responses"]);
    expect(resolveTransport("opencode-zen", "openai").baseUrl).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(resolveTransport("opencode-zen", "claude").baseUrl).toBe("https://opencode.ai/zen/v1/messages");
    expect(resolveTransport("opencode-zen", "openai-responses").baseUrl).toBe("https://opencode.ai/zen/v1/responses");
  });

  it("provides default model and populated model catalog", () => {
    const defaultModel = getDefaultModel("opencode-zen");
    expect(defaultModel).toBeTruthy();
    const models = PROVIDER_MODELS["opencode-zen"];
    expect(models.length).toBeGreaterThan(30);

    const ids = models.map((m) => m.id);
    expect(ids).toContain("gpt-6-astra");
    expect(ids).toContain("gpt-5.6-luna");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-opus-4-7");
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("glm-5.3-flash");
    expect(ids).toContain("minimax-m3");
    expect(ids).toContain("big-pickle");
  });

  it("assigns openai-responses target format to Muse Spark models", () => {
    expect(getModelTargetFormat("opencode-zen", "muse-spark-1.3")).toBe("openai-responses");
    expect(getModelTargetFormat("zen", "muse-spark-1.3")).toBe("openai-responses");
    expect(getModelTargetFormat("ocz", "muse-spark-1.3")).toBe("openai-responses");
  });

  it("checks supportedFormats per model category", () => {
    expect(getModelSupportedFormats("opencode-zen", "claude-sonnet-4-6")).toEqual(["openai", "claude"]);
    expect(getModelSupportedFormats("opencode-zen", "deepseek-v4-flash")).toEqual(["openai", "claude", "openai-responses"]);
    expect(getModelSupportedFormats("opencode-zen", "glm-5.3-flash")).toEqual(["openai"]);
    expect(getModelSupportedFormats("opencode-zen", "gpt-6-astra")).toEqual(["openai-responses"]);
  });
});

describe("OpenCode Zen executor", () => {
  it("resolves OpenCodeZenExecutor for opencode-zen and aliases", () => {
    expect(getExecutor("opencode-zen")).toBeInstanceOf(OpenCodeZenExecutor);
    expect(getExecutor("zen")).toBeInstanceOf(OpenCodeZenExecutor);
    expect(getExecutor("ocz")).toBeInstanceOf(OpenCodeZenExecutor);
  });

  it("injects desktop client and session headers", () => {
    const executor = getExecutor("opencode-zen");
    const headers = executor.buildHeaders({ apiKey: "test-key" }, true, "https://opencode.ai/zen/v1/chat/completions", "deepseek-v4-flash");
    expect(headers["x-opencode-client"]).toBe("desktop");
    expect(headers["x-opencode-session"]).toMatch(/^ses_[a-f0-9]{32}$/);
    expect(headers["Authorization"]).toBe("Bearer test-key");
  });

  it("routes Muse Spark and responses models to /zen/v1/responses", () => {
    const executor = getExecutor("opencode-zen");
    expect(executor.buildUrl("muse-spark-1.3")).toBe("https://opencode.ai/zen/v1/responses");
    expect(executor.buildUrl("gpt-5.6-luna")).toBe("https://opencode.ai/zen/v1/responses");
  });
});
