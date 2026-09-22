import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../");

describe("A11y & Action Hardening Verification", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), "utf-8");

  describe("1. Icon-only buttons & aria-label & focus-visible rings", () => {
    it("EndpointRow has aria-label, focus-visible ring, type=button, aria-hidden icon", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointRow.js");
      assert.ok(content.includes('type="button"'), "Missing type=button");
      assert.ok(content.includes("aria-label="), "Missing aria-label");
      assert.ok(content.includes("focus-visible:ring-2"), "Missing focus-visible ring");
      assert.ok(content.includes('aria-hidden="true"'), "Missing aria-hidden on icon");
    });

    it("EndpointUrlsCard has aria-label on all copy buttons and focus-visible rings", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(content.includes('aria-label={copied === "tunnel_url" ? "Copied" : "Copy tunnel URL"}'));
      assert.ok(content.includes('aria-label={copied === "ts_url" ? "Copied" : "Copy Tailscale URL"}'));
      assert.ok(content.includes("focus-visible:ring-2"));
    });

    it("TunnelCard & TailscaleCard copy buttons have aria-label and focus-visible rings", () => {
      const tunnelContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(tunnelContent.includes('aria-label={copied === "tunnel_card_url" ? "Copied" : "Copy Tunnel URL"}'));
      assert.ok(tunnelContent.includes("focus-visible:ring-2"));

      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes('aria-label={copied === "ts_card_url" ? "Copied" : "Copy Tailscale URL"}'));
      assert.ok(tsContent.includes("focus-visible:ring-2"));
    });

    it("ApiKeysCard copy, visibility, and delete buttons have aria-label and focus-visible rings", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/ApiKeysCard.js");
      assert.ok(content.includes("aria-label={visibleKeys.has(key.id)"));
      assert.ok(content.includes('aria-label={copied === key.id ? "Copied" : `Copy API key ${key.name}`}'));
      assert.ok(content.includes('aria-label={`Delete API key ${key.name}`}'));
      assert.ok(content.includes("focus-visible:ring-2 focus-visible:ring-red-500"));
    });
  });

  describe("2. Disable button & always-visible delete with ConfirmModal", () => {
    it("TunnelCard has labeled Disable button with variant=secondary and size=sm", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(content.includes('variant="secondary"'));
      assert.ok(content.includes('size="sm"'));
      assert.ok(/>\s*Disable\s*<\/Button>/.test(content));
      assert.ok(!content.includes(">power_settings_new<"));
    });

    it("TailscaleCard has labeled Disable button with variant=secondary and size=sm", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(content.includes('variant="secondary"'));
      assert.ok(content.includes('size="sm"'));
      assert.ok(/>\s*Disable\s*<\/Button>/.test(content));
      assert.ok(!content.includes(">power_settings_new<"));
    });

    it("ApiKeysCard delete button is always visible and wired to ConfirmModal", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/components/ApiKeysCard.js");
      assert.ok(!content.includes("sm:opacity-0"), "Delete button must not be hover-only sm:opacity-0");
      assert.ok(!content.includes("sm:group-hover:opacity-100"));
      assert.ok(content.includes("<ConfirmModal"), "ConfirmModal must be present");
      assert.ok(content.includes("handleDeleteKey"), "handleDeleteKey must be wired");
    });
  });

  describe("3. Sidebar drawer, focus trap, Esc close, skip link, Toast polite", () => {
    it("DashboardLayout contains skip link to #main-content", () => {
      const content = readSrc("src/shared/components/layouts/DashboardLayout.js");
      assert.ok(content.includes('href="#main-content"'));
      assert.ok(content.includes("Skip to main content"));
      assert.ok(content.includes('id="main-content"'));
    });

    it("DashboardLayout has Toast container with role=status and aria-live=polite", () => {
      const content = readSrc("src/shared/components/layouts/DashboardLayout.js");
      assert.ok(content.includes('role="status"'));
      assert.ok(content.includes('aria-live="polite"'));
    });

    it("DashboardLayout manages Escape key and focus trap on mobile drawer", () => {
      const content = readSrc("src/shared/components/layouts/DashboardLayout.js");
      assert.ok(content.includes('e.key === "Escape"'));
      assert.ok(content.includes('e.key === "Tab"'));
      assert.ok(content.includes('role="dialog"'));
      assert.ok(content.includes("aria-modal="));
    });

    it("Sidebar has close button on mobile view", () => {
      const content = readSrc("src/shared/components/Sidebar.js");
      assert.ok(content.includes('aria-label="Close navigation sidebar"'));
    });
  });

  describe("4. Contrast & Brand tokens", () => {
    it("globals.css defines brand tokens for dark-only cyan accent", () => {
      const css = readSrc("src/app/globals.css");
      assert.ok(css.includes("--color-brand-700: #0E7490;"));
      assert.ok(css.includes("--color-brand-text: var(--color-brand-400);"));
      assert.ok(css.includes("--color-primary: #06B6D4;"));
    });

    it("Endpoint badges use primary accent for text contrast", () => {
      const row = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointRow.js");
      assert.ok(row.includes("text-primary"));
      const urls = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(urls.includes("text-primary"));
    });
  });

  describe("5. Material symbols fallback and prefers-reduced-motion", () => {
    it("globals.css has fallback class fonts-failed and prefers-reduced-motion guard", () => {
      const css = readSrc("src/app/globals.css");
      assert.ok(css.includes(".fonts-failed .material-symbols-outlined"));
      assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
      assert.ok(css.includes("animation: none !important"));
    });

    it("layout.js triggers font fallback on failure or timeout", () => {
      const layout = readSrc("src/app/layout.js");
      assert.ok(layout.includes("fonts-failed"));
    });
  });

  describe("6. Updater flow confirm step + undo window", () => {
    it("Sidebar has confirm modal before shutdown", () => {
      const content = readSrc("src/shared/components/Sidebar.js");
      assert.ok(content.includes("Confirm Server Shutdown"));
      assert.ok(content.includes("handleConfirmShutdown"));
    });

    it("ManualUpdatePanel provides Undo Shutdown during countdown", () => {
      const content = readSrc("src/shared/components/Sidebar.js");
      assert.ok(content.includes("Undo Shutdown"));
      assert.ok(content.includes("handleUndoShutdown"));
      assert.ok(content.includes("Undo window active"));
    });
  });

  describe("7. Stale ONLINE hardening, Empty-URL guard, and Tooltip a11y", () => {
    it("useTunnelStatus keeps client ping alive at 30s when healthy and wakes on focus/visibilitychange", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/endpoint/hooks/useTunnelStatus.js");
      const consts = readSrc("src/app/(dashboard)/dashboard/endpoint/endpointConstants.js");
      assert.ok(consts.includes("CLIENT_PING_HEALTHY_MS = 30000"), "Missing CLIENT_PING_HEALTHY_MS constant");
      assert.ok(content.includes("CLIENT_PING_HEALTHY_MS"), "useTunnelStatus must import and use CLIENT_PING_HEALTHY_MS");
      assert.ok(content.includes('window.addEventListener("focus",'), "Missing focus listener");
      assert.ok(content.includes('document.addEventListener("visibilitychange",'), "Missing visibilitychange listener");
      assert.ok(!content.includes("if (tunnelHealthy && tsHealthy) return;\n    const id = setInterval"), "Client ping must not early-return skip interval when healthy");
    });

    it("EndpointUrlsCard, TunnelCard, and TailscaleCard guard empty URLs with placeholder and disable Copy", () => {
      const urlsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(urlsContent.includes("— not provisioned —"), "EndpointUrlsCard missing empty URL placeholder");
      assert.ok(urlsContent.includes("disabled={!tunnel.publicUrl && !tunnel.url}"), "EndpointUrlsCard missing disabled guard for tunnel copy");
      assert.ok(urlsContent.includes("disabled={!tailscale.publicUrl && !tailscale.url}"), "EndpointUrlsCard missing disabled guard for tailscale copy");

      const tunnelContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(tunnelContent.includes("— not provisioned —"), "TunnelCard missing empty URL placeholder");
      assert.ok(tunnelContent.includes("disabled={!tunnel.publicUrl && !tunnel.url}"), "TunnelCard missing disabled guard for tunnel copy");

      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes("— not provisioned —"), "TailscaleCard missing empty URL placeholder");
      assert.ok(tsContent.includes("disabled={!tailscale.publicUrl && !tailscale.url}"), "TailscaleCard missing disabled guard for tailscale copy");
    });

    it("Tooltip has focus-within, role=tooltip, aria-describedby, mobile tap toggle, and Esc dismiss", () => {
      const content = readSrc("src/shared/components/Tooltip.js");
      assert.ok(content.includes("focus-within:opacity-100"), "Tooltip missing focus-within:opacity-100");
      assert.ok(content.includes('role="tooltip"'), "Tooltip missing role=tooltip");
      assert.ok(content.includes("aria-describedby="), "Tooltip missing aria-describedby linkage");
      assert.ok(content.includes("onClick="), "Tooltip missing tap toggle");
      assert.ok(content.includes('"Escape"'), "Tooltip missing Esc dismiss");
    });
  });
});
