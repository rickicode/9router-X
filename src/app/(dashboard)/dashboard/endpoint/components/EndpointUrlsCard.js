"use client";

import PropTypes from "prop-types";
import { Card, Input } from "@/shared/components";
import EndpointRow from "./EndpointRow";

export default function EndpointUrlsCard({
 baseUrl,
 tunnel,
 tailscale,
 copied,
 onCopy,
}) {
 const isOnline = (tunnel?.enabled && tunnel?.reachable) || (tailscale?.enabled && tailscale?.reachable);
 const isReconnecting = (tunnel?.enabled && !tunnel?.reachable) || (tailscale?.enabled && !tailscale?.reachable);

 const statusChip = (
 <div className="flex items-center gap-2">
 <span
 className={`font-mono text-xs px-2 py-1 rounded-sm font-medium border flex items-center gap-1.5 ${
 isOnline
 ? "bg-success/10 text-success border-success/30"
 : isReconnecting
 ? "bg-warning/10 text-warning border-warning/30"
 : "bg-surface text-text-muted border-border"
 }`}
 >
 {isOnline ? (
 <span className="relative flex size-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-success opacity-75" />
 <span className="relative inline-flex rounded-full size-2 bg-success" />
 </span>
 ) : isReconnecting ? (
 <span className="size-2 rounded-full bg-warning animate-pulse" aria-hidden="true" />
 ) : (
 <span className="size-1.5 rounded-full bg-text-muted" aria-hidden="true" />
 )}
 {isOnline ? "ONLINE" : isReconnecting ? "RECONNECTING" : "LOCAL ONLY"}
 </span>
 </div>
 );

 return (
 <Card
 title="API Endpoints"
 subtitle="OpenAI-compatible base URLs for local and remote clients"
 icon="api"
 action={statusChip}
 >
 <div className="flex flex-col gap-3">
 {/* Local Endpoint Row */}
 <EndpointRow
 label="Local"
 url={baseUrl}
 copyId="local_url"
 copied={copied}
 onCopy={onCopy}
 />

 {/* Cloudflare Tunnel Row (when enabled) */}
 {tunnel?.enabled && (
 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <div className="flex items-center justify-between sm:justify-start">
 <span className="text-xs font-mono px-1.5 py-1 rounded-sm shrink-0 min-w-[88px] text-center bg-primary/10 text-primary font-medium">
 Tunnel
 </span>
 </div>
 {tunnel.reachable ? (
 <>
 <div className="flex-1 min-w-0 w-full">
 <Input
 value={(tunnel.publicUrl || tunnel.url) ? `${tunnel.publicUrl || tunnel.url}/v1` : "— not provisioned —"}
 readOnly
 className="w-full font-mono text-sm"
 />
 </div>
 <div className="flex items-center justify-end gap-1 shrink-0">
 <button
 type="button"
 disabled={!tunnel.publicUrl && !tunnel.url}
 onClick={() => (tunnel.publicUrl || tunnel.url) && onCopy(`${tunnel.publicUrl || tunnel.url}/v1`, "tunnel_url")}
 className="size-8 shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
 aria-label={copied === "tunnel_url" ? "Copied" : "Copy tunnel URL"}
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
 {copied === "tunnel_url" ? "check" : "content_copy"}
 </span>
 </button>
 </div>
 </>
 ) : tunnel.loading ? (
 <div className="flex-1 w-full flex items-center gap-2 px-3 py-1 rounded-sm border border-border bg-surface text-sm text-text-muted h-8">
 <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
 progress_activity
 </span>
 <span className="font-mono text-xs">
 {tunnel.progress || "Creating tunnel..."}
 </span>
 </div>
 ) : (
 <div className="flex-1 w-full flex items-center gap-2 px-3 py-2 rounded-sm border border-warning/30 bg-warning/10 text-sm text-warning">
 <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
 progress_activity
 </span>
 <span className="font-mono text-xs">
 {tunnel.everReachable ? "Tunnel reconnecting..." : "Tunnel checking..."}
 </span>
 </div>
 )}
 </div>
 )}

 {/* Tailscale Row (when enabled) */}
 {tailscale?.enabled && (
 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <div className="flex items-center justify-between sm:justify-start">
 <span className="text-xs font-mono px-1.5 py-1 rounded-sm shrink-0 min-w-[88px] text-center bg-primary/10 text-primary font-medium">
 Tailscale
 </span>
 </div>
 {tailscale.reachable ? (
 <>
 <div className="flex-1 min-w-0 w-full">
 <Input
 value={(!tailscale.publicUrl && !tailscale.url) ? "— not provisioned —" : `${tailscale.publicUrl || tailscale.url}/v1`}
 readOnly
 className="w-full font-mono text-sm"
 />
 </div>
 <div className="flex items-center justify-end gap-1 shrink-0">
 <button
 type="button"
 disabled={!tailscale.publicUrl && !tailscale.url}
 onClick={() => (tailscale.publicUrl || tailscale.url) && onCopy(`${tailscale.url}/v1`, "ts_url")}
 className="size-8 shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
 aria-label={copied === "ts_url" ? "Copied" : "Copy Tailscale URL"}
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
 {copied === "ts_url" ? "check" : "content_copy"}
 </span>
 </button>
 </div>
 </>
 ) : (tailscale.loading || tailscale.connecting) ? (
 <div className="flex-1 w-full flex items-center gap-2 px-3 py-1 rounded-sm border border-border bg-surface text-sm text-text-muted h-8">
 <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
 progress_activity
 </span>
 <span className="font-mono text-xs">
 {tailscale.progress || "Connecting..."}
 </span>
 </div>
 ) : (
 <div className="flex-1 w-full flex items-center gap-2 px-3 py-2 rounded-sm border border-warning/30 bg-warning/10 text-sm text-warning">
 <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
 progress_activity
 </span>
 <span className="font-mono text-xs">
 {tailscale.everReachable ? "Tailscale reconnecting..." : "Tailscale checking..."}
 </span>
 </div>
 )}
 </div>
 )}

 {/* Inactive hint if neither tunnel is enabled */}
 {!tunnel?.enabled && !tailscale?.enabled && (
 <div className="flex items-center gap-2 px-3 h-8 rounded-sm bg-surface-2/40 border border-border text-xs text-text-muted font-mono mt-1">
 <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0" aria-hidden="true">
 info
 </span>
 <span>Remote access inactive. Enable Cloudflare Tunnel or Tailscale below to connect external tools.</span>
 </div>
 )}
 </div>
 </Card>
 );
}

EndpointUrlsCard.propTypes = {
 baseUrl: PropTypes.string.isRequired,
 tunnel: PropTypes.shape({
 enabled: PropTypes.bool,
 reachable: PropTypes.bool,
 everReachable: PropTypes.bool,
 loading: PropTypes.bool,
 progress: PropTypes.string,
 url: PropTypes.string,
 publicUrl: PropTypes.string,
 }),
 tailscale: PropTypes.shape({
 enabled: PropTypes.bool,
 reachable: PropTypes.bool,
 everReachable: PropTypes.bool,
 loading: PropTypes.bool,
 connecting: PropTypes.bool,
 progress: PropTypes.string,
 url: PropTypes.string,
 }),
 copied: PropTypes.string,
 onCopy: PropTypes.func.isRequired,
};
