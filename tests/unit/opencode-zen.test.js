import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS, getDefaultModel, getModelSupportedFormats, getModelTargetFormat } from "../../open-sse/config/providerModels.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen.js";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { responsesCompletionToOpenAI } from "../../open-sse/translator/response/openai-responses-json.js";

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

  it("defaults Muse Spark reasoning to low for small output budgets", () => {
    const executor = getExecutor("opencode");
    const body = { model: "muse-spark-1.3-contributor-free", max_tokens: 16 };

    executor.transformRequest("muse-spark-1.3-contributor-free", body, false, {
      connectionId: "opencode-free-test",
      rawHeaders: {},
    });

    expect(body.reasoning).toMatchObject({ effort: "low", summary: "auto" });
    expect(body.max_output_tokens).toBe(16);
    expect(body.max_tokens).toBeUndefined();
  });

  it("preserves an explicitly requested reasoning level", () => {
    const executor = getExecutor("opencode");
    const body = { model: "muse-spark-1.3-contributor-free", max_tokens: 64, reasoning_effort: "high" };

    executor.transformRequest("muse-spark-1.3-contributor-free", body, false, {
      connectionId: "opencode-free-test",
      rawHeaders: {},
    });

    expect(body.reasoning).toMatchObject({ effort: "high", summary: "auto" });
  });

  it("converts a non-streaming Responses body into Chat Completions text", () => {
    const response = responsesCompletionToOpenAI({
      id: "resp_test",
      object: "response",
      status: "completed",
      model: "muse-spark-1.3-contributor-free",
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] },
      ],
      usage: { input_tokens: 11, output_tokens: 83, total_tokens: 94 },
    });

    expect(response.choices[0].message.content).toBe("OK");
    expect(response.choices[0].finish_reason).toBe("stop");
    expect(response.usage.total_tokens).toBe(94);
  });
});
