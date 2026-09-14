"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Modal, Toggle, Input } from "@/shared/components";
import { TUNNEL_BENEFITS } from "../endpointConstants";
import SecurityWarning from "./SecurityWarning";
import StatusAlert from "./StatusAlert";
import Tooltip from "./Tooltip";

export default function TunnelCard({
  tunnel,
  requireApiKey,
  requireLogin,
  hasPassword,
  tunnelDashboardAccess,
  onUpdateDashboardAccess,
  copied,
  onCopy,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);

  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? "Enable \"Require login\" and set a custom password before activating the tunnel."
    : "Change the default dashboard password before activating the tunnel.";

  const handleEnableClick = () => {
    if (isLoginUnsafe) {
      tunnel.setStatus({ type: "error", message: `Security required: ${unsafeReason}` });
      setIsExpanded(true);
      return;
    }
    if (!requireApiKey) {
      tunnel.setStatus({
        type: "error",
        message: "Security required: Enable \"Require API key\" before activating the tunnel.",
      });
      setIsExpanded(true);
      return;
    }
    setShowEnableModal(true);
  };

  const handleStartTunnel = async () => {
    setShowEnableModal(false);
    await tunnel.enable();
  };

  const handleConfirmDisable = async () => {
    const ok = await tunnel.disable();
    if (ok) {
      setShowDisableModal(false);
    }
  };

  // Status Chip
  const renderStatusChip = () => {
    if (tunnel.loading) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[12px] animate-spin" aria-hidden="true">
            progress_activity
          </span>
          STARTING
        </span>
      );
    }
    if (tunnel.status?.type === "error" && !tunnel.enabled) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-red-500" aria-hidden="true" />
          ERROR
        </span>
      );
    }
    if (tunnel.enabled && tunnel.reachable) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-green-500" />
          </span>
          ONLINE
        </span>
      );
    }
    if (tunnel.enabled && !tunnel.reachable) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
          {tunnel.everReachable ? "RECONNECTING" : "CHECKING"}
        </span>
      );
    }
    return (
      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-surface-2 text-text-muted border border-border-subtle flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-red-500/60" aria-hidden="true" />
        DISABLED
      </span>
    );
  };

  const actionHeader = (
    <div className="flex items-center gap-2">
      {renderStatusChip()}
      {tunnel.enabled ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowDisableModal(true)}
          disabled={tunnel.loading}
          aria-label="Disable Cloudflare Tunnel"
        >
          Disable
        </Button>
      ) : tunnel.loading ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={tunnel.stopLoading}
          aria-label="Stop starting tunnel"
        >
          Stop
        </Button>
      ) : (
        <Button
          size="sm"
          icon="cloud_upload"
          onClick={handleEnableClick}
          aria-label="Enable Cloudflare Tunnel"
        >
          Enable
        </Button>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-text-main transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        aria-label={isExpanded ? "Collapse Cloudflare Tunnel details" : "Expand Cloudflare Tunnel details"}
        aria-expanded={isExpanded}
      >
        <span className="material-symbols-outlined text-[20px] transition-transform duration-200" aria-hidden="true">
          {isExpanded ? "expand_less" : "expand_more"}
        </span>
      </button>
    </div>
  );

  return (
    <>
      <Card
        title="Cloudflare Tunnel"
        subtitle="Expose endpoint securely via Cloudflare Edge without open ports"
        icon="cloud_upload"
        action={actionHeader}
      >
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col gap-4">
            {tunnel.status && (
              <StatusAlert status={tunnel.status} />
            )}

            {/* Active URL details if enabled */}
            {tunnel.enabled && (
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-2/50 border border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-text-muted uppercase">Tunnel Public URL</span>
                  <span className="font-mono text-xs text-text-muted">HTTPS TLS 1.3</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Input
                    value={`${tunnel.publicUrl || tunnel.url}/v1`}
                    readOnly
                    className="flex-1 w-full font-mono text-sm"
                  />
                  <div className="flex items-center justify-end shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => onCopy(`${tunnel.publicUrl || tunnel.url}/v1`, "tunnel_card_url")}
                      className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-brand-700 dark:hover:text-brand-400 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      aria-label={copied === "tunnel_card_url" ? "Copied" : "Copy Tunnel URL"}
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        {copied === "tunnel_card_url" ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security warnings */}
            {tunnel.enabled && !requireApiKey && (
              <SecurityWarning
                message="Require API key is disabled — model endpoints (/v1/*) are publicly accessible without authentication."
                action={{ label: "Enable", href: "#require-api-key" }}
              />
            )}
            {tunnel.enabled && isLoginUnsafe && (
              <SecurityWarning
                message={
                  !requireLogin
                    ? "Require login is disabled — dashboard web UI is publicly accessible without credentials."
                    : "Dashboard uses default password — change it in Profile settings before exposing remotely."
                }
                action={{
                  label: !requireLogin ? "Enable" : "Change password",
                  href: "/dashboard/profile",
                }}
              />
            )}

            {/* Tunnel dashboard access option */}
            {tunnel.enabled && (
              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm">Allow dashboard access via tunnel</p>
                  <Tooltip text="When enabled, the dashboard can be accessed through your tunnel URL (login still required). When disabled, dashboard access via tunnel is completely blocked." />
                </div>
                <Toggle
                  checked={tunnelDashboardAccess}
                  onChange={() => onUpdateDashboardAccess(!tunnelDashboardAccess)}
                />
              </div>
            )}

            {/* Pre-enable Security gate notice if unsafe */}
            {!tunnel.enabled && isLoginUnsafe && (
              <SecurityWarning
                message={unsafeReason}
                action={{ label: "Open settings", href: "/dashboard/profile" }}
              />
            )}

            {/* Benefits overview */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {TUNNEL_BENEFITS.map((benefit) => (
                <div
                  key={benefit.title}
                  className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2/40 border border-border-subtle"
                >
                  <span className="material-symbols-outlined text-xl text-brand-700 dark:text-brand-400 mb-1" aria-hidden="true">
                    {benefit.icon}
                  </span>
                  <p className="text-xs font-semibold">{benefit.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{benefit.desc}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-text-muted font-mono">
              Requires outbound port 7844 (TCP/UDP). Connection initialization may take 10-30s.
            </p>
          </div>
        )}
      </Card>

      {/* Enable Tunnel Modal */}
      <Modal
        isOpen={showEnableModal}
        title="Enable Cloudflare Tunnel"
        onClose={() => setShowEnableModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-brand-700 dark:text-brand-400" aria-hidden="true">cloud_upload</span>
              <div>
                <p className="text-sm text-text-main font-medium mb-1">
                  Cloudflare Quick Tunnel
                </p>
                <p className="text-sm text-text-muted">
                  Expose your local 9Router to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2/50 border border-border-subtle"
              >
                <span className="material-symbols-outlined text-xl text-brand-700 dark:text-brand-400 mb-1" aria-hidden="true">
                  {benefit.icon}
                </span>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted font-mono">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>

          <div className="flex gap-2">
            <Button onClick={handleStartTunnel} fullWidth>
              Start Tunnel
            </Button>
            <Button onClick={() => setShowEnableModal(false)} variant="ghost" fullWidth>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disable Tunnel Modal */}
      <Modal
        isOpen={showDisableModal}
        title="Disable Cloudflare Tunnel"
        onClose={() => !tunnel.loading && setShowDisableModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            The Cloudflare tunnel will be disconnected. Remote access via tunnel URL will stop working immediately.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleConfirmDisable}
              fullWidth
              disabled={tunnel.loading}
              variant="danger"
            >
              {tunnel.loading ? "Disabling..." : "Disable"}
            </Button>
            <Button
              onClick={() => setShowDisableModal(false)}
              variant="ghost"
              fullWidth
              disabled={tunnel.loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

TunnelCard.propTypes = {
  tunnel: PropTypes.shape({
    enabled: PropTypes.bool,
    reachable: PropTypes.bool,
    loading: PropTypes.bool,
    progress: PropTypes.string,
    status: PropTypes.shape({
      type: PropTypes.string,
      message: PropTypes.string,
    }),
    url: PropTypes.string,
    publicUrl: PropTypes.string,
    enable: PropTypes.func.isRequired,
    disable: PropTypes.func.isRequired,
    stopLoading: PropTypes.func.isRequired,
    setStatus: PropTypes.func.isRequired,
  }).isRequired,
  requireApiKey: PropTypes.bool.isRequired,
  requireLogin: PropTypes.bool.isRequired,
  hasPassword: PropTypes.bool.isRequired,
  tunnelDashboardAccess: PropTypes.bool.isRequired,
  onUpdateDashboardAccess: PropTypes.func.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};
