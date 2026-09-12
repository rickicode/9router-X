import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true })),
  clearAccountError: vi.fn(async () => {}),
  handleChatCore: vi.fn(),
  getSettings: vi.fn(async () => ({ comboStrategy: "round-robin", comboStickyRoundRobinLimit: 1 })),
  checkAndRefreshToken: vi.fn(async (provider, creds) => creds),
  rrSeq: 0,
  redisDown: false,
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(async () => true),
}));
vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(async () => null),
  clearAntigravityStrikes: vi.fn(),
}));
vi.mock("open-sse/services/usage/freebuff.js", () => ({
  handleFreebuffQuotaError: vi.fn(async () => null),
}));
vi.mock("open-sse/executors/freebuff.js", () => ({
  canonicalFreebuffModel: (m) => m,
  FreebuffExecutor: class {},
}));
vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  lockAccountToModel: vi.fn(),
  lockProxyPoolForScope: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => ({
  saveFailedRequest: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: vi.fn(async (modelStr) => {
    if (!modelStr.includes("/")) return { provider: null };
    const [provider, ...rest] = modelStr.split("/");
    return { provider, model: rest.join("/") };
  }),
  getComboModels: vi.fn(async (modelStr) =>
    modelStr === "rr" ? ["p/m1", "p/m2", "p/m3"] : null),
}));
vi.mock("open-sse/handlers/chatCore.js", () => ({
  handleChatCore: mocks.handleChatCore,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: vi.fn(async () => {}),
  checkAndRefreshToken: mocks.checkAndRefreshToken,
}));
vi.mock("open-sse/services/projectId.js", () => ({
  getProjectIdForConnection: vi.fn(async () => null),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(),
  tagForSession: vi.fn(), nextTag: vi.fn(() => ""),
  maskKey: vi.fn((k) => k),
}));
vi.mock("@/lib/redis/client.js", () => ({
  incrModelFailCount: vi.fn(async () => 0),
  resetModelFailCount: vi.fn(async () => true),
  getModelFailCounts: vi.fn(async () => ({})),
  incrSharedCounter: vi.fn(async () => {
    if (mocks.redisDown) throw new Error("redis down");
    return ++mocks.rrSeq;
  }),
}));

const { handleSingleModelChat } = await import("@/sse/handlers/chat.js");
const { resetComboRotation } = await import("open-sse/services/combo.js");

const BODY = { model: "rr", messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rrSeq = 0;
  mocks.redisDown = false;
  mocks.getSettings.mockResolvedValue({ comboStrategy: "round-robin", comboStickyRoundRobinLimit: 1 });
  let n = 0;
  mocks.getProviderCredentials.mockImplementation(async () => ({
    connectionId: `c-${++n}`,
    connectionName: `acc-${n}`,
    providerSpecificData: {},
    testStatus: "active",
  }));
});

describe("strict round-robin", () => {
  it("starts each request at the next member across requests", async () => {
    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      tried.push(`${opts.modelInfo.provider}/${opts.modelInfo.model}`);
      await opts.onRequestSuccess?.();
      return { success: true, response: { status: 200 } };
    });
    for (let i = 0; i < 4; i++) {
      const res = await handleSingleModelChat({ ...BODY }, "rr", null, null, null, null, false, { used: 0 });
      expect(res.status).toBe(200);
    }
    // seq 1..4 → start m1, m2, m3, m1. First-try success each time.
    expect(tried).toEqual(["p/m1", "p/m2", "p/m3", "p/m1"]);
  });

  it("honors stickyLimit: same member for N consecutive requests", async () => {
    mocks.getSettings.mockResolvedValue({ comboStrategy: "round-robin", comboStickyRoundRobinLimit: 2 });
    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      tried.push(`${opts.modelInfo.provider}/${opts.modelInfo.model}`);
      return { success: true, response: { status: 200 } };
    });
    for (let i = 0; i < 4; i++) {
      await handleSingleModelChat({ ...BODY }, "rr", null, null, null, null, false, { used: 0 });
    }
    // floor((seq-1)/2): seq 1,2 → m1; seq 3,4 → m2.
    expect(tried).toEqual(["p/m1", "p/m1", "p/m2", "p/m2"]);
  });

  it("falls back to in-memory rotation when Redis is down", async () => {
    mocks.redisDown = true;
    resetComboRotation("rr");
    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      tried.push(`${opts.modelInfo.provider}/${opts.modelInfo.model}`);
      return { success: true, response: { status: 200 } };
    });
    for (let i = 0; i < 3; i++) {
      await handleSingleModelChat({ ...BODY }, "rr", null, null, null, null, false, { used: 0 });
    }
    expect(tried).toEqual(["p/m1", "p/m2", "p/m3"]);
  });

  it("fair-share: dead first member cannot starve the combo", async () => {
    mocks.getSettings.mockResolvedValue({ comboStrategy: "fallback" });
    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      const key = `${opts.modelInfo.provider}/${opts.modelInfo.model}`;
      tried.push(key);
      if (key === "p/m1") return { success: false, status: 503, error: "dead" };
      await opts.onRequestSuccess?.();
      return { success: true, response: { status: 200 } };
    });
    const res = await handleSingleModelChat({ ...BODY }, "rr", null, null, null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    // 3 members of 5 budget → member share ceil(5/3)=2: m1 tried at most 2x,
    // then the combo moves on and m2 succeeds — m3 never needed.
    expect(tried.filter((t) => t === "p/m1").length).toBeLessThanOrEqual(2);
    expect(tried[tried.length - 1]).toBe("p/m2");
    expect(tried.length).toBeLessThanOrEqual(5);
  });
});
