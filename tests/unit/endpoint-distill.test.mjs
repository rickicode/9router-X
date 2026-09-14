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
      assert.ok(urlsContent.includes("bg-zinc-400") || urlsContent.includes("bg-amber-500"), "Dot must be zinc/gray or amber");
    });

    it("EndpointPageClient renders exactly 4 CardSkeletons in loading state", () => {
      const clientContent = readSrc("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js");
      const matches = clientContent.match(/<CardSkeleton\s*\/>/g);
      assert.equal(matches?.length, 4, "Must render exactly 4 CardSkeletons matching the 4-card layout");
    });
  });
});
