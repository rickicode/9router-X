import { describe, it, expect, beforeAll } from "vitest";
import { getAdapter } from "@/lib/db/driver.js";
import {
  isRedisAvailable,
  getRedis,
  setAccountCooldown,
  isAccountInCooldown,
  setModelCooldown,
  isModelInCooldown,
  getBatchCooldowns,
  getCachedConnections,
  setCachedConnections,
  acquireLock,
  releaseLock,
} from "@/lib/redis/client.js";
import {
  createProviderConnection,
  getProviderConnections,
  updateProviderConnection,
  deleteProviderConnection,
  getAvailableAccountsForRouting,
} from "@/lib/db/repos/connectionsRepo.js";
import {
  createApiKey,
  getApiKeys,
  validateApiKey,
  deleteApiKey,
} from "@/lib/db/repos/apiKeysRepo.js";
import {
  upsertUsageSnapshot,
  getBatchProviderQuotas,
} from "@/lib/db/repos/usageSnapshotsRepo.js";
import { makeKv } from "@/lib/db/helpers/kvStore.js";
import { saveRequestDetail, getRequestDetails } from "@/lib/db/repos/requestDetailsRepo.js";
import { GET as healthGet } from "@/app/api/health/route.js";
import { GET as quotasGet } from "@/app/api/usage/quotas/route.js";

describe("Postgres & Redis L2 Architecture E2E", () => {
  beforeAll(async () => {
    // Wait for Redis connection to settle
    await new Promise((r) => setTimeout(r, 200));
  });

  it("should verify Postgres connection and migrations", async () => {
    const db = await getAdapter();
    expect(db).toBeDefined();
    const rows = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = rows.map((r) => r.table_name);
    expect(tables).toContain("provider_connections");
    expect(tables).toContain("usage_snapshots");
    expect(tables).toContain("api_keys");
    expect(tables).toContain("settings");
    expect(tables).toContain("request_details");
    expect(tables).toContain("usage_history");
  });

  it("should verify Redis speed layer operations", async () => {
    if (isRedisAvailable()) {
      await setAccountCooldown("test-redis-conn", 10);
      const inCd = await isAccountInCooldown("test-redis-conn");
      expect(inCd).toBe(true);

      await setModelCooldown("test-redis-conn", "claude-3-7-sonnet", 10);
      const modelInCd = await isModelInCooldown(
        "test-redis-conn",
        "claude-3-7-sonnet",
      );
      expect(modelInCd).toBe(true);

      const lock = await acquireLock("test-suite-lock", 10);
      expect(lock).toBe(true);
      await releaseLock("test-suite-lock");

      // Verify batch cooldown check (O(1) roundtrip for thousands of connections)
      await setAccountCooldown("batch-conn-1", 10);
      await setModelCooldown("batch-conn-2", "gpt-4o", 10);
      const cooledDown = await getBatchCooldowns(
        ["batch-conn-1", "batch-conn-2", "batch-conn-3"],
        "gpt-4o"
      );
      expect(cooledDown.has("batch-conn-1")).toBe(true);
      expect(cooledDown.has("batch-conn-2")).toBe(true);
      expect(cooledDown.has("batch-conn-3")).toBe(false);

      // Verify cached connections speed layer
      await setCachedConnections("test-provider", [{ id: "c1", provider: "test-provider" }], 5);
      const cached = await getCachedConnections("test-provider");
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe("c1");
    }
  });

  it("should perform connection routing and fair-share jitter query", async () => {
    const created = await createProviderConnection({
      id: "e2e-conn-1",
      provider: "openai",
      authType: "apikey",
      name: "E2E OpenAI Test",
      apiKey: "sk-e2e-test",
      priority: 1,
      isActive: true,
    });
    expect(created.id).toBe("e2e-conn-1");

    const candidates = await getAvailableAccountsForRouting({
      provider: "openai",
      model: "gpt-4o",
      limit: 5,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.some((c) => c.id === "e2e-conn-1")).toBe(true);

    // Cleanup
    await deleteProviderConnection("e2e-conn-1");
  });

  it("should batch query usage snapshots without N+1 problem", async () => {
    await createProviderConnection({
      id: "e2e-quota-conn",
      provider: "antigravity",
      authType: "oauth",
      name: "E2E Antigravity Quota Test",
      email: "quota@test.com",
      priority: 1,
      isActive: true,
    });

    await upsertUsageSnapshot({
      connectionId: "e2e-quota-conn",
      provider: "antigravity",
      plan: "pro",
      quotas: { "gemini-2.5-flash": { remainingPercentage: 75 } },
      remainingPct: 75,
    });

    const batch = await getBatchProviderQuotas("antigravity");
    expect(batch.length).toBeGreaterThanOrEqual(1);
    const found = batch.find((b) => b.connectionId === "e2e-quota-conn");
    expect(found).toBeDefined();
    expect(found.remainingPct).toBe(75);
    expect(found.name).toBe("E2E Antigravity Quota Test");

    // Cleanup
    await deleteProviderConnection("e2e-quota-conn");
  });

  it("should verify composite health check route", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.postgres).toBe(true);
  });

  it("should verify kvStore works with Postgres placeholders", async () => {
    const testKv = makeKv("test_scope");
    await testKv.set("hello", { foo: "bar" });
    const val = await testKv.get("hello");
    expect(val).toEqual({ foo: "bar" });

    await testKv.setMany({ a: 1, b: 2 });
    const all = await testKv.getAll();
    expect(all.a).toBe(1);
    expect(all.b).toBe(2);

    await testKv.remove("hello");
    const removed = await testKv.get("hello");
    expect(removed).toBeNull();
    await testKv.clear();
  });

  it("should safely handle non-timestamp model_locks values in routing", async () => {
    const conn = await createProviderConnection({
      id: "e2e-lock-conn",
      provider: "openai",
      authType: "apikey",
      name: "E2E Bad Lock Test",
      apiKey: "sk-bad-lock",
      priority: 1,
      isActive: true,
      modelLocks: { "gpt-4o": "invalid-non-date-value" },
    });
    expect(conn.id).toBe("e2e-lock-conn");

    // Routing query should not crash with Postgres timestamp syntax error
    const candidates = await getAvailableAccountsForRouting({
      provider: "openai",
      model: "gpt-4o",
      limit: 5,
    });
    expect(Array.isArray(candidates)).toBe(true);

    await deleteProviderConnection("e2e-lock-conn");
  });

  it("should verify batch quotas API route", async () => {
    const req = new Request("http://localhost/api/usage/quotas?provider=openai");
    const res = await quotasGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.quotas)).toBe(true);
  });
});
