import { describe, it, expect, beforeEach, vi } from "vitest";

const connectionsDb = new Map();
let settingsDb = {};

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async ({ provider, isActive } = {}) => {
    return Array.from(connectionsDb.values()).filter(
      (c) => (!provider || c.provider === provider) && (!isActive || c.isActive),
    );
  }),
  getSettings: vi.fn(async () => settingsDb),
  updateProviderConnection: vi.fn(async (id, patch) => {
    const existing = connectionsDb.get(id) || {};
    const updated = { ...existing, ...patch };
    connectionsDb.set(id, updated);
    return updated;
  }),
  lockAccountToModel: vi.fn(async () => {}),
  unlockAccountModel: vi.fn(async () => {}),
  getProxyPools: vi.fn(async () => []),
}));

vi.mock("@/lib/redis/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  invalidateCachedConnections: vi.fn(async () => {}),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));

import { checkFallbackError, isModelLockActive } from "open-sse/services/accountFallback.js";
import { getProviderCredentials, markAccountUnavailable } from "../../src/sse/services/auth.js";

const INKLING_403_ERROR = JSON.stringify({
  error: {
    message: "thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps",
    code: 403,
    metadata: {
      routing_funnel: [{ step: "Initial Endpoints", endpoint_count: 1 }],
      failed_routing_step: "Gate Free Endpoints by Agentic Harness",
    },
  },
});

describe("OpenRouter Model-Level 403 Gating", () => {
  beforeEach(() => {
    connectionsDb.clear();
    settingsDb = {};
    vi.clearAllMocks();
  });

  it("classifies agentic harness 403 as a model-level restriction with lockAll=false", () => {
    const result = checkFallbackError(403, INKLING_403_ERROR, 0);
    expect(result.shouldFallback).toBe(true);
    expect(result.lockAll).toBe(false);
    expect(result.disableAccount).toBe(false);
  });

  it("marks only the failed model as locked and leaves the OpenRouter account active for other models", async () => {
    const connId = "or-conn-1";
    connectionsDb.set(connId, {
      id: connId,
      provider: "openrouter",
      authType: "apikey",
      name: "OpenRouter User",
      apiKey: "sk-or-v1-12345678",
      isActive: true,
      testStatus: "active",
      modelLocks: {},
    });

    const res = await markAccountUnavailable(
      connId,
      403,
      INKLING_403_ERROR,
      "openrouter",
      "thinkingmachines/inkling:free",
    );

    expect(res.shouldFallback).toBe(true);

    const updated = connectionsDb.get(connId);
    // Account itself MUST remain active
    expect(updated.isActive).toBe(true);
    expect(updated.testStatus).toBe("active");
    expect(updated.lockedAllUntil).toBeUndefined();

    // The restricted model MUST be locked
    expect(isModelLockActive(updated, "thinkingmachines/inkling:free")).toBe(true);

    // Other models MUST NOT be locked
    expect(isModelLockActive(updated, "openai/gpt-4o")).toBe(false);
    expect(isModelLockActive(updated, "anthropic/claude-3.5-sonnet")).toBe(false);

    // Routing for another model successfully selects this connection
    const creds = await getProviderCredentials("openrouter", null, "openai/gpt-4o");
    expect(creds.connectionId).toBe(connId);

    // Routing for the restricted model correctly identifies all accounts are locked for this model
    const restrictedCreds = await getProviderCredentials("openrouter", null, "thinkingmachines/inkling:free");
    expect(restrictedCreds?.allRateLimited).toBe(true);
  });

  it("generic 403 without model context still locks all models", () => {
    const result = checkFallbackError(403, "Forbidden", 0);
    expect(result.shouldFallback).toBe(true);
    expect(result.lockAll).toBe(true);
  });
});
