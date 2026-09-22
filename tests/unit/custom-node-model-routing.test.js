import { describe, it, expect, beforeEach, vi } from "vitest";

// The dashboard model Test button sends "<full-node-id>/<model>" (e.g.
// "openai-compatible-chat-omop/gpt-4o"), while client routing normally sends
// "<prefix>/<model>" (e.g. "omop/gpt-4o"). Both must resolve to the custom
// node, never fall through to the openai inference fallback (which produced
// "No active credentials for provider: openai" 503s on model tests).

const mocks = vi.hoisted(() => ({
  getProviderNodes: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getComboByName: vi.fn(async () => null),
  getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: mocks.getProviderNodes,
}));

vi.mock("open-sse/config/coreModelCombos.js", () => ({
  getCoreComboMembers: vi.fn(() => null),
}));

const { getModelInfo } = await import("@/sse/services/model");

describe("custom provider node routing (getModelInfo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderNodes.mockImplementation(async ({ type } = {}) => {
      const nodes = [
        { id: "openai-compatible-chat-omop", prefix: "omop", type: "openai-compatible" },
        { id: "anthropic-compatible-claudeproxy", prefix: "claudeproxy", type: "anthropic-compatible" },
      ];
      return type ? nodes.filter((n) => n.type === type) : nodes;
    });
  });

  it("resolves node id prefix to the custom node (dashboard Test button path)", async () => {
    const info = await getModelInfo("openai-compatible-chat-omop/gpt-4o");
    expect(info.provider).toBe("openai-compatible-chat-omop");
    expect(info.model).toBe("gpt-4o");
  });

  it("resolves user-defined prefix to the custom node", async () => {
    const info = await getModelInfo("omop/gpt-4o");
    expect(info.provider).toBe("openai-compatible-chat-omop");
    expect(info.model).toBe("gpt-4o");
  });

  it("resolves anthropic-compatible node id and prefix", async () => {
    const info = await getModelInfo("anthropic-compatible-claudeproxy/claude-sonnet-5");
    expect(info.provider).toBe("anthropic-compatible-claudeproxy");
    expect(info.model).toBe("claude-sonnet-5");

    const byPrefix = await getModelInfo("claudeproxy/claude-sonnet-5");
    expect(byPrefix.provider).toBe("anthropic-compatible-claudeproxy");
  });

  it("keeps built-in provider prefixes untouched (no node lookup)", async () => {
    const info = await getModelInfo("openrouter/openai/gpt-4o");
    expect(info.provider).not.toBe("openai-compatible-chat-omop");
    // openrouter is a reserved prefix: parsed as built-in, not routed to node
    expect(info.provider).toBe("openrouter");
  });

  it("falls back to inference for unknown prefixes (existing behavior)", async () => {
    const info = await getModelInfo("totally-unknown-prefix/deepseek-v4.1-flash");
    expect(info.provider).not.toBe("openai-compatible-chat-omop");
  });
});
