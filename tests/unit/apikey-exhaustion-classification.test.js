import { describe, expect, it } from "vitest";

const { classifyBlockedCredentials } = await import("../../src/sse/services/auth.js");

describe("API-key provider exhaustion classification", () => {
  it("returns account exhausted when all credentials have account quota exhaustion", async () => {
    const result = classifyBlockedCredentials("opencode-zen", "muse-spark-1.2-contributor-free", [
      { id: "a", isActive: true, testStatus: "exhausted" },
      { id: "b", isActive: true, testStatus: "exhausted" },
    ]);
    expect(result).toMatchObject({ allRateLimited: true, lastErrorCode: "ACCOUNT_EXHAUSTED" });
    expect(result.statusBreakdown.accountExhausted).toBe(2);
  });

  it("never reports a model lock as active after its timestamp expires", async () => {
    const result = classifyBlockedCredentials("opencode-zen", "muse-spark-1.2-contributor-free", [
      { id: "a", isActive: true, testStatus: "active", modelLocks: { "muse-spark-1.2-contributor-free": new Date(Date.now() - 1000).toISOString() } },
    ]);
    expect(result).toBeNull();
  });

  it("reports mixed blocked states instead of claiming all accounts are exhausted", () => {
    const result = classifyBlockedCredentials("unikey", "gemini-3.5-flash", [
      { id: "a", isActive: true, testStatus: "exhausted" },
      { id: "b", isActive: false, testStatus: "disabled" },
    ]);
    expect(result).toMatchObject({ allRateLimited: true, lastErrorCode: "MIXED_BLOCKED" });
    expect(result.statusBreakdown).toMatchObject({ accountExhausted: 1, disabled: 1 });
  });
});
