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

 // Keep card expanded when authentication is required
 useEffect(() => {
 if (tailscale.authUrl) {
 setIsExpanded(true);
 }
 }, [tailscale.authUrl]);

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
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5">
 <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">
 progress_activity
 </span>
 CONNECTING
 </span>
 );
 }
 if (tailscale.authUrl) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5">
 <span className="size-2 rounded-full bg-warning animate-pulse" aria-hidden="true" />
 AUTH REQUIRED
 </span>
 );
 }
 if (tailscale.status?.type === "error" && !tailscale.enabled) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-danger/10 text-danger border border-danger/30 flex items-center gap-1.5">
 <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
 ERROR
 </span>
 );
 }
 if (tailscale.enabled && tailscale.reachable) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-success/10 text-success border border-success/30 flex items-center gap-1.5">
 <span className="relative flex size-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-success opacity-75" />
 <span className="relative inline-flex rounded-full size-2 bg-success" />
 </span>
 ONLINE
 </span>
 );
 }
 if (tailscale.enabled && !tailscale.reachable) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5">
 <span className="size-2 rounded-full bg-warning animate-pulse" aria-hidden="true" />
 {tailscale.everReachable ? "RECONNECTING" : "CHECKING"}
 </span>
 );
 }
 return (
 <span className="font-mono text-xs px-2.5 rounded-sm font-medium bg-surface text-text-muted border border-border flex items-center gap-1.5 h-8">
 <span className="size-1.5 rounded-full bg-text-muted" aria-hidden="true" />
 DISABLED
 </span>
 );
 };

 const openTailscaleAuth = (url) => {
 if (!url) return;
 // Primary attempt: window.open popup/new tab
 // Fallback: persistent auth link card ('Open auth in new tab' + copy link button)
 // Note: Replaces disruptive window.location.href = url which yanked current tab away
 try {
 window.open(
 url,
 "tailscale_auth",
 "width=600,height=700,noopener,noreferrer"
 );
 } catch {
 /* popup blocked — handled by persistent auth link card in card body */
 }
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
 className="size-8 hover:bg-surface-2 rounded-sm text-text-muted hover:text-text-main focus-visible:outline-none"
 aria-label={isExpanded ? "Collapse Tailscale Funnel details" : "Expand Tailscale Funnel details"}
 aria-expanded={isExpanded}
 >
 <span className="material-symbols-outlined text-[18px] transition-transform" aria-hidden="true">
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
 <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
 {tailscale.status && (
 <StatusAlert status={tailscale.status} />
 )}

 {/* Persistent auth link card */}
 {tailscale.authUrl && (
 <div className="p-3 rounded-sm bg-warning/10 border border-warning/30 flex flex-col gap-3">
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 text-sm text-warning font-medium">
 <span className="material-symbols-outlined text-sm" aria-hidden="true">login</span>
 <span>Authentication required to continue Tailscale connection</span>
 </div>
 <span className="font-mono text-[11px] px-1.5 py-1 rounded-sm bg-warning/10 text-warning font-medium shrink-0">
 Auth Required
 </span>
 </div>
 <p className="text-xs text-text-muted font-mono">
 Log in to authorize this node. If the auth popup was blocked, open in a new tab or copy the link:
 </p>
 <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-warning/30">
 <div className="flex items-center gap-2">
 <a
 href={tailscale.authUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none"
 aria-label="Open auth in new tab"
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_new</span>
 <span>Open auth in new tab</span>
 </a>
 <button
 type="button"
 onClick={() => onCopy(tailscale.authUrl, "ts_auth_url")}
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-surface hover:bg-surface-2 text-text-main border border-border focus-visible:outline-none h-8"
 aria-label={copied === "ts_auth_url" ? "Copied" : "Copy link"}
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
 {copied === "ts_auth_url" ? "check" : "content_copy"}
 </span>
 <span>{copied === "ts_auth_url" ? "Copied" : "Copy link"}</span>
 </button>
 </div>
 <code className="text-[11px] font-mono text-text-muted truncate max-w-[200px] sm:max-w-xs">
 {tailscale.authUrl}
 </code>
 </div>
 </div>
 )}

 {/* In-progress indicator */}
 {(tailscale.loading || tailscale.connecting) && (
 <div className="flex items-center justify-between p-3 rounded-sm bg-surface-2/40 border border-border h-8">
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
 <div className="flex flex-col gap-3 p-3 rounded-sm bg-surface-2 border border-border">
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono text-text-muted">Tailscale Endpoint URL</span>
 <span className="font-mono text-xs text-text-muted">MagicDNS *.ts.net</span>
 </div>
 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <Input
 value={(!tailscale.publicUrl && !tailscale.url) ? "— not provisioned —" : `${tailscale.publicUrl || tailscale.url}/v1`}
 readOnly
 className="flex-1 w-full font-mono text-sm"
 />
 <div className="flex items-center justify-end shrink-0 self-end sm:self-auto">
 <button
 type="button"
 disabled={!tailscale.publicUrl && !tailscale.url}
 onClick={() => (tailscale.publicUrl || tailscale.url) && onCopy(`${tailscale.url}/v1`, "ts_card_url")}
 className="size-8 shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
 aria-label={copied === "ts_card_url" ? "Copied" : "Copy Tailscale URL"}
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
 {copied === "ts_card_url" ? "check" : "content_copy"}
 </span>
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Pre-enable Security gate notice if unsafe */}
 {!tailscale.enabled && isLoginUnsafe && (
 <SecurityWarning
 message={
 !requireLogin
 ? "Require login is disabled — enable dashboard login before activating Tailscale Funnel."
 : "Dashboard uses default password — change it in Profile settings before activating Tailscale Funnel."
 }
 action={{ label: "Open settings", href: "/dashboard/profile" }}
 />
 )}

 {/* Technical description */}
 <div className="p-3 rounded-sm bg-surface-2/30 border border-border text-xs text-text-muted space-y-3 font-mono">
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
 <div className="flex flex-col gap-3">
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
 className="bg-surface rounded-sm p-3 max-h-40 overflow-y-auto font-mono text-xs text-text-muted"
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
 <div className="flex items-center gap-2 text-sm text-success">
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
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
 <div className="flex flex-col gap-3">
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
