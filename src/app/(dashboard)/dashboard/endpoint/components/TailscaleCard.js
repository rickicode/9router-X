"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, Button, Modal, Input } from "@/shared/components";
import SecurityWarning from "./SecurityWarning";
import StatusAlert from "./StatusAlert";

export default function TailscaleCard({
  tailscale,
  requireLogin,
  hasPassword,
  copied,
  onCopy,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const tsLogRef = useRef(null);

  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? "Enable \"Require login\" and set a custom password before activating the tunnel."
    : "Change the default dashboard password before activating the tunnel.";

  // Auto-scroll install log
  useEffect(() => {
    if (tsLogRef.current) {
      tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
    }
  }, [tailscale.installLog]);

  const handleOpenTsModal = async () => {
    if (isLoginUnsafe) {
      tailscale.setStatus({ type: "error", message: `Security required: ${unsafeReason}` });
      setIsExpanded(true);
      return;
    }
    tailscale.setStatus(null);
    const data = await tailscale.checkInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      await tailscale.connect();
    } else {
      setShowTsModal(true);
    }
  };

  const handleConfirmDisable = async () => {
    const ok = await tailscale.disable();
    if (ok) {
      setShowDisableModal(false);
    }
  };

  // Status Chip
  const renderStatusChip = () => {
    if (tailscale.loading || tailscale.connecting) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[12px] animate-spin" aria-hidden="true">
            progress_activity
          </span>
          CONNECTING
        </span>
      );
    }
    if (tailscale.authUrl) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          AUTH REQUIRED
        </span>
      );
    }
    if (tailscale.status?.type === "error" && !tailscale.enabled) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-red-500" aria-hidden="true" />
          ERROR
        </span>
      );
    }
    if (tailscale.enabled && tailscale.reachable) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-green-500" aria-hidden="true" />
          ONLINE
        </span>
      );
    }
    if (tailscale.enabled && !tailscale.reachable) {
      return (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
          CONNECTING
        </span>
      );
    }
    return (
      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full font-medium bg-surface-2 text-text-muted border border-border-subtle flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-text-muted/40" aria-hidden="true" />
        DISABLED
      </span>
    );
  };

  const actionHeader = (
    <div className="flex items-center gap-2">
      {renderStatusChip()}
      {tailscale.enabled ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowDisableModal(true)}
          disabled={tailscale.loading}
          aria-label="Disable Tailscale Funnel"
        >
          Disable
        </Button>
      ) : (tailscale.loading || tailscale.connecting) ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={tailscale.stopLoading}
          aria-label="Stop connecting Tailscale"
        >
          Stop
        </Button>
      ) : (
        <Button
          size="sm"
          icon="vpn_lock"
          onClick={handleOpenTsModal}
          aria-label="Enable Tailscale Funnel"
        >
          Enable
        </Button>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-text-main transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        aria-label={isExpanded ? "Collapse Tailscale Funnel details" : "Expand Tailscale Funnel details"}
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
        title="Tailscale Funnel"
        subtitle="Route traffic securely through your private Tailnet mesh network"
        icon="vpn_lock"
        action={actionHeader}
      >
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col gap-4">
            {tailscale.status && (
              <StatusAlert status={tailscale.status} />
            )}

            {/* Auth URL prompt */}
            {tailscale.authUrl && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">login</span>
                  <span>Authentication required to continue Tailscale connection</span>
                </div>
                <Button
                  size="sm"
                  icon="open_in_new"
                  onClick={() =>
                    window.open(
                      tailscale.authUrl,
                      "tailscale_auth",
                      "width=600,height=700,noopener,noreferrer"
                    )
                  }
                  aria-label="Open Tailscale Login Window"
                >
                  {tailscale.authLabel || "Open Login"}
                </Button>
              </div>
            )}

            {/* In-progress indicator */}
            {(tailscale.loading || tailscale.connecting) && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2/40 border border-border-subtle">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
                    progress_activity
                  </span>
                  <span className="font-mono text-xs">
                    {tailscale.progress || "Connecting Tailscale Funnel..."}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={tailscale.stopLoading}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Active URL if enabled */}
            {tailscale.enabled && (
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-2/50 border border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-text-muted uppercase">Tailscale Endpoint URL</span>
                  <span className="font-mono text-xs text-text-muted">MagicDNS *.ts.net</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={`${tailscale.url}/v1`}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => onCopy(`${tailscale.url}/v1`, "ts_card_url")}
                    className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-brand-700 dark:hover:text-brand-400 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                    aria-label={copied === "ts_card_url" ? "Copied" : "Copy Tailscale URL"}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {copied === "ts_card_url" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Pre-enable Security gate notice if unsafe */}
            {!tailscale.enabled && isLoginUnsafe && (
              <SecurityWarning
                message={unsafeReason}
                action={{ label: "Open settings", href: "/dashboard/profile" }}
              />
            )}

            {/* Technical description */}
            <div className="p-3 rounded-lg bg-surface-2/30 border border-border-subtle text-xs text-text-muted space-y-1.5 font-mono">
              <p>• Point-to-point encrypted mesh network via WireGuard protocol.</p>
              <p>• Automatically handles NAT traversal and firewall punch-through.</p>
              <p>• Requires Tailscale daemon running on host machine with Funnel capability enabled.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Tailscale Setup Modal */}
      <Modal
        isOpen={showTsModal}
        title="Tailscale Funnel Setup"
        onClose={() => {
          if (!tailscale.installing) {
            setShowTsModal(false);
            tailscale.setStatus(null);
          }
        }}
      >
        <div className="flex flex-col gap-4">
          {tailscale.installed === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
                progress_activity
              </span>
              Checking Tailscale installation...
            </p>
          )}

          {tailscale.installed === false && !tailscale.installing && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">
                Tailscale is not installed on this system. Click below to install it via official script.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => tailscale.install()} fullWidth>
                  Install Tailscale
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {tailscale.installing && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
                  progress_activity
                </span>
                Installing Tailscale...
              </div>
              {tailscale.installLog?.length > 0 && (
                <div
                  ref={tsLogRef}
                  className="bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted"
                >
                  {tailscale.installLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tailscale.installed === true && !tailscale.installing && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  check_circle
                </span>
                Tailscale is installed and ready
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { setShowTsModal(false); tailscale.connect(); }} fullWidth>
                  Connect
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {tailscale.status && <StatusAlert status={tailscale.status} />}
        </div>
      </Modal>

      {/* Disable Tailscale Modal */}
      <Modal
        isOpen={showDisableModal}
        title="Disable Tailscale Funnel"
        onClose={() => !tailscale.loading && setShowDisableModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Tailscale Funnel will be stopped. Remote access via Tailscale URL will stop working immediately.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleConfirmDisable}
              fullWidth
              disabled={tailscale.loading}
              variant="danger"
            >
              {tailscale.loading ? "Disabling..." : "Disable"}
            </Button>
            <Button
              onClick={() => setShowDisableModal(false)}
              variant="ghost"
              fullWidth
              disabled={tailscale.loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

TailscaleCard.propTypes = {
  tailscale: PropTypes.shape({
    enabled: PropTypes.bool,
    reachable: PropTypes.bool,
    loading: PropTypes.bool,
    connecting: PropTypes.bool,
    installed: PropTypes.bool,
    installing: PropTypes.bool,
    installLog: PropTypes.arrayOf(PropTypes.string),
    progress: PropTypes.string,
    status: PropTypes.shape({
      type: PropTypes.string,
      message: PropTypes.string,
    }),
    url: PropTypes.string,
    authUrl: PropTypes.string,
    authLabel: PropTypes.string,
    checkInstalled: PropTypes.func.isRequired,
    install: PropTypes.func.isRequired,
    connect: PropTypes.func.isRequired,
    disable: PropTypes.func.isRequired,
    stopLoading: PropTypes.func.isRequired,
    setStatus: PropTypes.func.isRequired,
  }).isRequired,
  requireLogin: PropTypes.bool.isRequired,
  hasPassword: PropTypes.bool.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};
