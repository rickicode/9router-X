import { describe, expect, it, vi } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getModelsByProviderId, getDefaultModel } from "../../open-sse/config/providerModels.js";
import { resolveUnikeyModels, clearUnikeyCatalog } from "../../open-sse/services/unikeyModels.js";

describe("UniKey provider", () => {
  const unikey = REGISTRY.find((e) => e.id === "unikey");

  it("is registered as an OpenAI-compatible apikey provider with uk alias", () => {
    expect(unikey).toBeDefined();
    expect(unikey.category).toBe("apikey");
    expect(unikey.transport.baseUrl).toBe("https://www.getunikey.ai/v1/chat/completions");
    expect(unikey.alias).toBe("unikey");
    expect(unikey.aliases).toContain("uk");
    expect(unikey.uiAlias).toBe("uk");
  });

  it("exposes default models including claude-opus-4-8 and distinct gemini models", () => {
    const defaultModels = unikey.models.map((m) => m.id);
    expect(defaultModels).toContain("claude-opus-4-8");
    expect(defaultModels).toContain("google/gemini-3.5-flash");
    expect(defaultModels).toContain("gemini-3.5-flash");

    // verify google/gemini-3.5-flash and gemini-3.5-flash are distinct
    expect("google/gemini-3.5-flash").not.toBe("gemini-3.5-flash");
    expect(defaultModels.length).toBe(3);
  });

  it("configures modelsFetcher for dynamic discovery", () => {
    expect(unikey.modelsFetcher).toMatchObject({
      url: "https://www.getunikey.ai/v1/models",
      type: "openai",
    });
    expect(unikey.passthroughModels).toBe(true);
  });

  it("builds into PROVIDERS and PROVIDER_MODELS", () => {
    expect(PROVIDERS.unikey).toBeDefined();
    expect(PROVIDERS.unikey.format).toBe("openai");

    const models = getModelsByProviderId("unikey");
    expect(models.map((m) => m.id)).toEqual([
      "claude-opus-4-8",
      "google/gemini-3.5-flash",
      "gemini-3.5-flash",
    ]);

    // alias uk also resolves
    const ukModels = getModelsByProviderId("uk");
    expect(ukModels.map((m) => m.id)).toEqual([
      "claude-opus-4-8",
      "google/gemini-3.5-flash",
      "gemini-3.5-flash",
    ]);

    expect(getDefaultModel("unikey")).toBe("claude-opus-4-8");
    expect(getDefaultModel("uk")).toBe("claude-opus-4-8");
  });

  it("resolveUnikeyModels parses upstream /models and caches results", async () => {
    clearUnikeyCatalog();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
          { id: "google/gemini-3.5-flash", name: "Google Gemini 3.5 Flash" },
          { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
          { id: "gpt-6-astra", name: "GPT-6 Astra" },
        ],
      }),
    });

    global.fetch = mockFetch;

    const result = await resolveUnikeyModels({ apiKey: "test-key" });
    expect(result).toBeDefined();
    expect(result.models.length).toBe(4);
    expect(result.models.map((m) => m.id)).toContain("gpt-6-astra");

    // Cache hit
    const cachedResult = await resolveUnikeyModels({ apiKey: "test-key" });
    expect(cachedResult.models.length).toBe(4);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    clearUnikeyCatalog();
  });
});
