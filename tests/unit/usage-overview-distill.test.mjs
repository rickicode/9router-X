import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERVIEW_SUBTABS,
  VALID_OVERVIEW_SUBTABS,
  resolveActiveSubTab,
} from "../../src/lib/usageOverview.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

describe("[9router-X usage] P1 distill overview sub-tabs + lazy topology/chart (LCP)", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf-8");

  describe("1. OVERVIEW_SUBTABS Specification & Resolver", () => {
    it("exports OVERVIEW_SUBTABS array with 4 distilled views", () => {
      assert.ok(Array.isArray(OVERVIEW_SUBTABS));
      assert.equal(OVERVIEW_SUBTABS.length, 4);

      const tabValues = OVERVIEW_SUBTABS.map((t) => t.value);
      assert.deepEqual(tabValues, ["breakdown", "trends", "topology", "activity"]);
      assert.deepEqual(VALID_OVERVIEW_SUBTABS, ["breakdown", "trends", "topology", "activity"]);
    });

    it("each sub-tab has valid label and icon for technical infra tone", () => {
      for (const tab of OVERVIEW_SUBTABS) {
        assert.ok(typeof tab.value === "string" && tab.value.length > 0);
        assert.ok(typeof tab.label === "string" && tab.label.length > 0);
        assert.ok(typeof tab.icon === "string" && tab.icon.length > 0);
      }

      const breakdown = OVERVIEW_SUBTABS.find((t) => t.value === "breakdown");
      assert.equal(breakdown.label, "Breakdown");
      assert.equal(breakdown.icon, "table_chart");

      const trends = OVERVIEW_SUBTABS.find((t) => t.value === "trends");
      assert.equal(trends.label, "Trends");
      assert.equal(trends.icon, "show_chart");

      const topology = OVERVIEW_SUBTABS.find((t) => t.value === "topology");
      assert.equal(topology.label, "Topology");
      assert.equal(topology.icon, "hub");

      const activity = OVERVIEW_SUBTABS.find((t) => t.value === "activity");
      assert.equal(activity.label, "Live Activity");
      assert.equal(activity.icon, "sensors");
    });

    it("resolveActiveSubTab resolves valid sub-tabs and safely falls back to 'breakdown'", () => {
      assert.equal(resolveActiveSubTab("breakdown"), "breakdown");
      assert.equal(resolveActiveSubTab("trends"), "trends");
      assert.equal(resolveActiveSubTab("topology"), "topology");
      assert.equal(resolveActiveSubTab("activity"), "activity");

      assert.equal(resolveActiveSubTab(""), "breakdown");
      assert.equal(resolveActiveSubTab(null), "breakdown");
      assert.equal(resolveActiveSubTab(undefined), "breakdown");
      assert.equal(resolveActiveSubTab("unknown_tab"), "breakdown");
      assert.equal(resolveActiveSubTab(123), "breakdown");
      assert.equal(resolveActiveSubTab("  trends  "), "trends");
    });

    it("src/shared/components/index.js re-exports OVERVIEW_SUBTABS", () => {
      const indexSrc = readSrc("src/shared/components/index.js");
      assert.match(indexSrc, /export\s*\{\s*default\s+as\s+UsageStats,\s*OVERVIEW_SUBTABS\s*\}\s*from\s*"[./]+UsageStats";/);
    });

    it("src/shared/components/UsageStats.js exports OVERVIEW_SUBTABS and resolveActiveSubTab", () => {
      const statsSrc = readSrc("src/shared/components/UsageStats.js");
      assert.match(statsSrc, /import\s*\{\s*OVERVIEW_SUBTABS,\s*resolveActiveSubTab\s*\}\s*from\s*"@\/lib\/usageOverview";/);
      assert.match(statsSrc, /export\s*\{\s*OVERVIEW_SUBTABS,\s*resolveActiveSubTab\s*\};/);
    });
  });

  describe("2. Lazy Loading Topology & Chart for LCP Optimization", () => {
    it("UsageChart is dynamically imported to keep recharts out of initial bundle", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Must not statically import UsageChart
      assert.ok(!src.includes('import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";'));
      assert.ok(!src.includes('import UsageChart from "./UsageChart";'));

      // Must use dynamic import with ssr: false and fallback skeleton
      assert.match(
        src,
        /const UsageChart = dynamic\(\s*\(\)\s*=>\s*import\("@\/app\/\(dashboard\)\/dashboard\/usage\/components\/UsageChart"\),\s*\{[^}]*ssr:\s*false/s
      );
    });

    it("ProviderTopology is dynamically imported to keep @xyflow/react out of initial bundle", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(
        src,
        /const ProviderTopology = dynamic\(\s*\(\)\s*=>\s*import\("@\/app\/\(dashboard\)\/dashboard\/usage\/components\/ProviderTopology"\),\s*\{[^}]*ssr:\s*false/s
      );
    });

    it("Provider fetching is lazily gated by activeSubTab === 'topology'", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Verify lazy gate
      assert.match(src, /activeSubTab\s*!==\s*"topology"/);
      assert.match(src, /providersLoaded\.current/);
      assert.match(src, /fetch\("\/api\/providers/);
      assert.match(src, /fetch\("\/api\/provider-nodes"\)/);
    });
  });

  describe("3. Overview Sub-tab Routing & Conditional Rendering", () => {
    it("defaults activeSubTab to 'breakdown' via resolveActiveSubTab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(src, /const subTabFromUrl = searchParams\.get\("subtab"\);/);
      assert.match(src, /activeSubTab\s*=\s*subtabProp\s*\?\?\s*resolveActiveSubTab\(subTabFromUrl,\s*"breakdown"\);/);
    });

    it("updates subtab in searchParams without scrolling when user switches subtab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(src, /params\.set\("subtab",\s*value\)/);
      assert.match(src, /router\.replace\(`\?\$\{params\.toString\(\)\}`,\s*\{\s*scroll:\s*false\s*\}\)/);
    });

    it("conditionally renders each sub-tab section based on activeSubTab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Breakdown tab renders UsageTable and dimension select
      assert.match(src, /activeSubTab\s*===\s*"breakdown"/);
      assert.match(src, /<UsageTable/);

      // Trends tab renders UsageChart
      assert.match(src, /activeSubTab\s*===\s*"trends"/);
      assert.match(src, /<UsageChart\s+period=\{period\}\s*\/>/);

      // Topology tab renders ProviderTopology and RecentRequests
      assert.match(src, /activeSubTab\s*===\s*"topology"/);
      assert.match(src, /<ProviderTopology/);
      assert.match(src, /<RecentRequests/);

      // Activity tab renders RealtimeRequestsCard and RequestStream
      assert.match(src, /activeSubTab\s*===\s*"activity"/);
      assert.match(src, /<RealtimeRequestsCard/);
      assert.match(src, /<RequestStream/);
    });

    it("UsagePage passes subtab to UsageStats and retains all main tabs", () => {
      const pageSrc = readSrc("src/app/(dashboard)/dashboard/usage/page.js");

      assert.match(pageSrc, /subtab=\{searchParams\.get\("subtab"\)\s*\|\|\s*undefined\}/);
      assert.ok(pageSrc.includes('{ value: "overview", label: "Overview" }'));
      assert.ok(pageSrc.includes('{ value: "logs", label: "Logs" }'));
      assert.ok(pageSrc.includes('{ value: "details", label: "Details" }'));
      assert.ok(pageSrc.includes('{ value: "analytics", label: "Analytics" }'));
    });
  });
});
