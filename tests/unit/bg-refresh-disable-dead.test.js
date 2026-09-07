/**
 * Background refresh must DISABLE connections whose refresh token is
 * unrecoverable (e.g. "Account has been deleted"), not just tag them.
 * Otherwise dead accounts keep showing "active" in the UI forever.
 *
 * Exercises the real refreshOne path: dynamic imports inside
 * backgroundTokenRefresh.js are intercepted via doMock on the same specifiers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

vi.mock("@/lib/redis/client.js", () => ({
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
}));
vi.mock("open-sse/services/tokenRefresh.js", () => ({
  getRefreshLeadMs: () => 5 * 60 * 1000,
}));
vi.mock("open-sse/services/oauthCredentialManager.js", () => ({
  getCredentialExpiryMs: (credentials) => {
    if (credentials?.expiresAt == null) return null;
    const ms = new Date(credentials.expiresAt).getTime();
    return Number.isFinite(ms) ? ms : null;
  },
}));

describe("refreshOne unrecoverable refresh error disables connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes isActive=false + testStatus disabled on refreshError", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      refreshError: "Account has been deleted",
      refreshErrorAt: new Date(NOW).toISOString(),
    }));
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-1",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-dead",
      expiresAt: new Date(NOW - 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1);
    expect(updateProviderConnection).toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({
        isActive: false,
        testStatus: "disabled",
        errorCode: 401,
      })
    );
    const patch = updateProviderConnection.mock.calls[0][1];
    expect(patch.providerSpecificData.refreshBlocked).toBe("Account has been deleted");
    expect(patch.providerSpecificData.refreshBlockedAt).toBe(new Date(NOW).toISOString());
  });

  it("does NOT disable when refresh succeeds", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      accessToken: "new-tok",
    }));
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-2",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-ok",
      expiresAt: new Date(NOW - 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1);
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });
});
