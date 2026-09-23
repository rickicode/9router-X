import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../");

describe("Endpoint Distill & Polish Verification", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), "utf-8");

  describe("1. No silent auto-provision 'Default Key' + Empty State CTA", () => {
    it("EndpointPageClient does not auto-provision 'Default Key' on empty key list", () => {
      const clientContent = readSrc("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js");
      assert.ok(!clientContent.includes('name: "Default Key"'), "Must not auto-create Default Key");
      assert.ok(!clientContent.includes('fetch("/api/keys", {\n            method: "POST"'));
    });

    it("ApiKeysCard renders clear empty state CTA 'Create your first API key'", () => {
      const cardContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/ApiKeysCard.js");
      assert.ok(cardContent.includes("Create your first API key"), "Missing 'Create your first API key' CTA");
      assert.ok(cardContent.includes("No API keys yet") || cardContent.includes("No API keys created"));
      assert.ok(cardContent.includes("/v1/*"));
    });
  });

  describe("2. Tailscale auth fallback: persistent auth card + primary window.open", () => {
    it("TailscaleCard uses window.open as primary and renders persistent auth link card", () => {
      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes("window.open("), "Primary window.open must be present");
      assert.ok(tsContent.includes("Open auth in new tab"), "Must have 'Open auth in new tab'");
      assert.ok(tsContent.includes("ts_auth_url"), "Must have copy link button for auth URL");
      assert.ok(!tsContent.includes("window.location.href = url;"), "Must not yank tab via window.location.href = url;");
    });
  });

  describe("3. Dedupe TUNNEL_BENEFITS + Dedupe URL", () => {
    it("TunnelBenefitsGrid is extracted to a single reusable component", () => {
      const gridContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelBenefitsGrid.js");
      assert.ok(gridContent.includes("TUNNEL_BENEFITS.map"), "TunnelBenefitsGrid must map benefits");
      assert.ok(gridContent.includes("export default function TunnelBenefitsGrid"));
    });

    it("TunnelCard renders benefits grid 1x via extracted component and not in modal", () => {
      const tunnelContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(tunnelContent.includes("<TunnelBenefitsGrid"), "TunnelCard must use TunnelBenefitsGrid");
      // Count occurrences of TunnelBenefitsGrid in JSX
      const matches = tunnelContent.match(/<TunnelBenefitsGrid/g);
      assert.equal(matches?.length, 1, "TunnelBenefitsGrid must only be rendered 1x in TunnelCard");
      assert.ok(tunnelContent.includes("Aggregated above"), "Must indicate URL is aggregated above");
    });
  });

  describe("4. Minor polish: LOCAL ONLY amber/gray dot + 4 CardSkeletons", () => {
    it("EndpointUrlsCard LOCAL ONLY status chip dot uses amber/gray dot, not red", () => {
      const urlsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(!urlsContent.includes("bg-red-500/60"), "LOCAL ONLY dot must not be red error dot");
      assert.ok(
        urlsContent.includes("bg-zinc-400") || urlsContent.includes("bg-amber-500") || urlsContent.includes("bg-text-muted"),
        "Dot must be zinc/gray, amber, or the neutral text-muted token",
      );
    });

    it("EndpointPageClient renders exactly 4 CardSkeletons in loading state", () => {
      const clientContent = readSrc("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js");
      const matches = clientContent.match(/<CardSkeleton\s*\/>/g);
      assert.equal(matches?.length, 4, "Must render exactly 4 CardSkeletons matching the 4-card layout");
    });
  });

  describe("5. Tooltip SSOT distillation", () => {
    it("shared/components/Tooltip supports children wrapper and inline icon when children omitted", () => {
      const sharedTooltip = readSrc("src/shared/components/Tooltip.js");
      assert.ok(sharedTooltip.includes("children ||"), "Must support inline icon fallback when children omitted");
      assert.ok(sharedTooltip.includes("group-hover/tt:opacity-100"), "Must use scoped group/tt hover");
      assert.ok(sharedTooltip.includes("focus-within:opacity-100"), "Must support focus-within");
      assert.ok(sharedTooltip.includes('role="tooltip"'), "Must have role=tooltip");
    });

    it("endpoint/components/Tooltip re-exports from shared/components/Tooltip SSOT", () => {
      const endpointTooltip = readSrc("src/app/(dashboard)/dashboard/endpoint/components/Tooltip.js");
      assert.ok(endpointTooltip.includes('from "@/shared/components/Tooltip"'), "Must re-export from shared Tooltip");
    });
  });

  describe("6. globals.css brand token deduplication", () => {
    it(":root declares brand tokens once and .dark only overrides brand-text", () => {
      const css = readSrc("src/app/globals.css");
      // App is dark-only: brand scale lives in :root; no duplicated scale blocks.
      const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
      assert.ok(rootMatch, ":root block must exist");
      const rootBlock = rootMatch[1];
      assert.ok(rootBlock.includes("--color-brand-50:"), ":root must define --color-brand-50");
      assert.ok(rootBlock.includes("--color-brand-text: var(--color-brand-400);"), ":root must set brand-text");
      // No other block re-declares the brand scale
      const dupes = (css.match(/--color-brand-500:\s+(?!var)/g) || []);
      assert.ok(dupes.length === 1, `--color-brand-500 declared exactly once, got ${dupes.length}`);
    });
  });

  describe("7. EndpointRow flexible badge prop", () => {
    it("EndpointRow supports flexible boolean/string badge prop with brand text contrast", () => {
      const rowContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointRow.js");
      assert.ok(rowContent.includes("badge = false") || rowContent.includes("Boolean(badge)"), "Must support flexible badge prop");
      assert.ok(
        rowContent.includes("text-brand-700 dark:text-brand-400") || rowContent.includes("text-primary"),
        "Must maintain brand/primary text contrast",
      );
    });
  });
});
