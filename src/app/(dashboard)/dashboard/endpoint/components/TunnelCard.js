"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Modal, Toggle, Input } from "@/shared/components";
import TunnelBenefitsGrid from "./TunnelBenefitsGrid";
import SecurityWarning from "./SecurityWarning";
import StatusAlert from "./StatusAlert";
import Tooltip from "@/shared/components/Tooltip";

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
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5">
 <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">
 progress_activity
 </span>
 STARTING
 </span>
 );
 }
 if (tunnel.status?.type === "error" && !tunnel.enabled) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-danger/10 text-danger border border-danger/30 flex items-center gap-1.5">
 <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
 ERROR
 </span>
 );
 }
 if (tunnel.enabled && tunnel.reachable) {
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
 if (tunnel.enabled && !tunnel.reachable) {
 return (
 <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5">
 <span className="size-2 rounded-full bg-warning animate-pulse" aria-hidden="true" />
 {tunnel.everReachable ? "RECONNECTING" : "CHECKING"}
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
 className="size-8 hover:bg-surface-2 rounded-sm text-text-muted hover:text-text-main focus-visible:outline-none"
 aria-label={isExpanded ? "Collapse Cloudflare Tunnel details" : "Expand Cloudflare Tunnel details"}
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
 title="Cloudflare Tunnel"
 subtitle="Expose endpoint securely via Cloudflare Edge without open ports"
 icon="cloud_upload"
 action={actionHeader}
 >
 {isExpanded && (
 <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
 {tunnel.status && (
 <StatusAlert status={tunnel.status} />
 )}

 {/* Active URL details if enabled */}
 {tunnel.enabled && (
 <div className="flex flex-col gap-3 p-3 rounded-sm bg-surface-2 border border-border">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xs font-mono text-text-muted">Tunnel Public URL</span>
 <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-sm bg-surface text-text-muted border border-border">
 Aggregated above
 </span>
 </div>
 <span className="font-mono text-xs text-text-muted">HTTPS TLS 1.3</span>
 </div>
 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <Input
 value={(tunnel.publicUrl || tunnel.url) ? `${tunnel.publicUrl || tunnel.url}/v1` : "— not provisioned —"}
 readOnly
 className="flex-1 w-full font-mono text-sm"
 />
 <div className="flex items-center justify-end shrink-0 self-end sm:self-auto">
 <button
 type="button"
 disabled={!tunnel.publicUrl && !tunnel.url}
 onClick={() => (tunnel.publicUrl || tunnel.url) && onCopy(`${tunnel.publicUrl || tunnel.url}/v1`, "tunnel_card_url")}
 className="size-8 shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
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

 {/* Benefits overview (rendered 1x via extracted component) */}
 {!tunnel.enabled && (
 <TunnelBenefitsGrid className="pt-2" />
 )}

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
 <div className="flex flex-col gap-3">
 <div className="bg-surface border border-border rounded-sm p-3">
 <div className="flex items-start gap-3">
 <span className="material-symbols-outlined text-primary" aria-hidden="true">cloud_upload</span>
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
 <div className="flex flex-col gap-3">
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
