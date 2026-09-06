import { describe, it, expect, beforeEach, vi } from "vitest";

const connectionsDb = new Map();
let settingsDb = {};

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async ({ provider, isActive } = {}) => {
    let list = Array.from(connectionsDb.values());
    if (provider) list = list.filter((c) => c.provider === provider);
    if (isActive !== undefined) list = list.filter((c) => c.isActive === isActive);
    return list;
  }),
  getSettings: vi.fn(async () => settingsDb),
  updateProviderConnection: vi.fn(async (id, patch) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    connectionsDb.set(id, updated);
    return updated;
  }),
  lockAccountToModel: vi.fn(async (id, model, durationMs = 3600000) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const until = new Date(Date.now() + durationMs).toISOString();
    const updated = { ...existing, lockedToModel: model, lockedToModelUntil: until };
    connectionsDb.set(id, updated);
    return updated;
  }),
  unlockAccountModel: vi.fn(async (id) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const updated = { ...existing, lockedToModel: null, lockedToModelUntil: null };
    connectionsDb.set(id, updated);
    return updated;
  }),
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
  resolveConnectionProxyConfig: vi.fn(async (psd) => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    proxyPoolId: null,
  })),
  pickProxyPoolId: vi.fn(() => null),
}));

import { getProviderCredentials, markAccountUnavailable } from "../../src/sse/services/auth.js";

describe("Freebuff 1-Hour Dynamic Model Affinity Lock", () => {
  beforeEach(() => {
    connectionsDb.clear();
    settingsDb = {};
    vi.clearAllMocks();
  });

  it("prioritizes an account that is already locked to the requested model", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      priority: 2,
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30m left
    });

    // Account 2: unlocked / clean
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      priority: 1, // Higher priority!
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    // Request for deepseek/deepseek-v4-flash should pick Account 1 (already locked to it)
    // even though Account 2 has higher priority, to avoid burning clean Account 2.
    const creds = await getProviderCredentials("freebuff", null, "deepseek/deepseek-v4-flash");
    expect(creds.connectionId).toBe("fb-conn-1");
  });

  it("picks an unlocked account when no account is locked to the requested model", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    // Account 2: clean / unlocked
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    // Request for openai/gpt-5.6-luna must NOT pick Account 1 (locked to deepseek).
    // It must pick Account 2 (clean/unlocked).
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.connectionId).toBe("fb-conn-2");
  });

  it("excludes accounts locked to other models and returns 503 retry payload when all accounts are locked", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    });

    // Account 2: locked to minimax/minimax-m3
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      lockedToModel: "minimax/minimax-m3",
      lockedToModelUntil: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });

    // Request for openai/gpt-5.6-luna has NO matching account and NO clean account
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.allRateLimited).toBe(true);
    expect(creds.lastErrorCode).toBe("FREEBUFF_MODEL_LOCKED");
    expect(creds.lastError).toContain("locked to other models");
  });

  it("automatically releases model lock after 1 hour (expired lock)", async () => {
    // Account 1: lock expired 5 minutes ago
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // EXPIRED
    });

    // Request for a different model (openai/gpt-5.6-luna) can now use Account 1 because lock expired!
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.connectionId).toBe("fb-conn-1");
  });

  it("disables banned accounts, clears affinity, and excludes them from lock retries", async () => {
    const bannedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    connectionsDb.set("fb-banned", {
      id: "fb-banned",
      provider: "freebuff",
      authType: "oauth",
      name: "Banned Account",
      accessToken: "banned-token",
      isActive: true,
      testStatus: "active",
      lockedToModel: "openai/gpt-5.6-luna",
      lockedToModelUntil: bannedUntil,
      lockedAllUntil: bannedUntil,
      modelLocks: { "openai/gpt-5.6-luna": bannedUntil },
    });

    await markAccountUnavailable(
      "fb-banned",
      403,
      "Freebuff account has been banned (403)",
      "freebuff",
      "openai/gpt-5.6-luna",
      null,
      "banned",
    );

    const banned = connectionsDb.get("fb-banned");
    expect(banned.isActive).toBe(false);
    expect(banned.testStatus).toBe("disabled");
    expect(banned.lockedToModel).toBeNull();
    expect(banned.lockedToModelUntil).toBeNull();
    expect(banned.lockedAllUntil).toBeNull();
    expect(banned.modelLocks).toEqual({});

    connectionsDb.set("fb-active", {
      id: "fb-active",
      provider: "freebuff",
      authType: "oauth",
      name: "Active Account",
      accessToken: "active-token",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.allRateLimited).toBe(true);
    expect(creds.lastErrorCode).toBe("FREEBUFF_MODEL_LOCKED");
    expect(creds.retryAfter).not.toBe(bannedUntil);
  });
});
