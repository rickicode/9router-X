import { describe, it, expect, beforeEach, vi } from "vitest";

const poolsDb = new Map();

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(async (id) => poolsDb.get(id) || null),
  getProxyPools: vi.fn(async ({ isActive } = {}) => {
    const list = Array.from(poolsDb.values());
    if (isActive !== undefined) return list.filter((p) => p.isActive === isActive);
    return list;
  }),
}));

import {
  markPoolUnfit,
  resetPoolFitness,
} from "open-sse/services/proxyPoolFitness.js";
import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

describe("Smart Proxy Resolution & Multi-Pool Candidate Failover", () => {
  beforeEach(() => {
    resetPoolFitness();
    poolsDb.clear();
  });

  it("skips inactive or deleted pool and selects the next active pool in candidates", async () => {
    poolsDb.set("pool-inactive", {
      id: "pool-inactive",
      name: "Inactive Pool",
      proxyUrl: "http://127.0.0.1:8001",
      isActive: false,
    });
    poolsDb.set("pool-active", {
      id: "pool-active",
      name: "Active Pool",
      proxyUrl: "http://127.0.0.1:8002",
      isActive: true,
      strictProxy: true,
    });

    const res = await resolveConnectionProxyConfig(
      {
        proxyPoolIds: ["pool-inactive", "pool-active"],
        proxyRotationStrategy: "round-robin",
      },
      "conn-1",
    );

    expect(res.source).toBe("pool");
    expect(res.proxyPoolId).toBe("pool-active");
    expect(res.connectionProxyUrl).toBe("http://127.0.0.1:8002");
    expect(res.strictProxy).toBe(true);
  });

  it("returns noFitPool: true for Freebuff smart strategy when all candidates are unfit", async () => {
    poolsDb.set("p1", { id: "p1", proxyUrl: "http://1.1.1.1:80", isActive: true });
    poolsDb.set("p2", { id: "p2", proxyUrl: "http://2.2.2.2:80", isActive: true });

    markPoolUnfit("p1", "freebuff::openai/gpt-5.6-luna", Date.now() + 60_000, "limited_ip");
    markPoolUnfit("p2", "freebuff::openai/gpt-5.6-luna", Date.now() + 60_000, "country_blocked");

    const res = await resolveConnectionProxyConfig(
      {
        proxyPoolIds: ["p1", "p2"],
        proxyRotationStrategy: "smart",
        proxyPoolScope: "freebuff::openai/gpt-5.6-luna",
      },
      "conn-freebuff-1",
    );

    expect(res.noFitPool).toBe(true);
    expect(res.proxyPoolId).toBeNull();
    expect(res.connectionProxyEnabled).toBe(false);
  });

  it("supports proxyGroup resolution and respects fitness scope", async () => {
    poolsDb.set("g1", { id: "g1", group: "US-East", proxyUrl: "http://us1.proxy:80", isActive: true });
    poolsDb.set("g2", { id: "g2", group: "US-East", proxyUrl: "http://us2.proxy:80", isActive: true });

    markPoolUnfit("g1", "freebuff::openai/gpt-5.6-luna", Date.now() + 60_000, "country_blocked");

    const res = await resolveConnectionProxyConfig(
      {
        proxyGroup: "US-East",
        proxyRotationStrategy: "smart",
        proxyPoolScope: "freebuff::openai/gpt-5.6-luna",
      },
      "conn-group-1",
    );

    expect(res.source).toBe("pool");
    expect(res.proxyPoolId).toBe("g2");
    expect(res.connectionProxyUrl).toBe("http://us2.proxy:80");
  });

  it("respects excludePoolIds across retries and picks next healthy pool", async () => {
    poolsDb.set("p1", { id: "p1", proxyUrl: "http://1.1.1.1:80", isActive: true });
    poolsDb.set("p2", { id: "p2", proxyUrl: "http://2.2.2.2:80", isActive: true });
    poolsDb.set("p3", { id: "p3", proxyUrl: "http://3.3.3.3:80", isActive: true });

    const res = await resolveConnectionProxyConfig(
      {
        proxyPoolIds: ["p1", "p2", "p3"],
        proxyRotationStrategy: "round-robin",
      },
      "conn-retry-test",
      ["p1", "p2"],
    );

    expect(res.proxyPoolId).toBe("p3");
    expect(res.connectionProxyUrl).toBe("http://3.3.3.3:80");
  });

  it("prevents direct connection leak and throws when strictProxy is true and no proxy URL is available", async () => {
    await expect(
      proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        strictProxy: true,
        connectionProxyEnabled: false,
        connectionProxyUrl: "",
      }),
    ).rejects.toThrow(/\[ProxyFetch\] Proxy required but no proxy URL configured or available/);
  });
});
