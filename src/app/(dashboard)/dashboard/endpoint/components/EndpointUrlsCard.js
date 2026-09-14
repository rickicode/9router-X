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
        className={`font-mono text-xs px-2.5 py-0.5 rounded-full font-medium border flex items-center gap-1.5 ${
          isOnline
            ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
            : isReconnecting
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            : "bg-surface-2 text-text-muted border-border-subtle"
        }`}
      >
        {isOnline ? (
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-green-500" />
          </span>
        ) : isReconnecting ? (
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        ) : (
          <span className="size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" aria-hidden="true" />
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
      <div className="flex flex-col gap-2.5">
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
              <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center bg-primary/10 text-brand-700 dark:text-brand-400 font-medium">
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
                    className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-brand-700 dark:hover:text-brand-400 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={copied === "tunnel_url" ? "Copied" : "Copy tunnel URL"}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {copied === "tunnel_url" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </>
            ) : tunnel.loading ? (
              <div className="flex-1 w-full flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
                  progress_activity
                </span>
                <span className="font-mono text-xs">
                  {tunnel.progress || "Creating tunnel..."}
                </span>
              </div>
            ) : (
              <div className="flex-1 w-full flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
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
              <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center bg-primary/10 text-brand-700 dark:text-brand-400 font-medium">
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
                    className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-brand-700 dark:hover:text-brand-400 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={copied === "ts_url" ? "Copied" : "Copy Tailscale URL"}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {copied === "ts_url" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </>
            ) : (tailscale.loading || tailscale.connecting) ? (
              <div className="flex-1 w-full flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
                  progress_activity
                </span>
                <span className="font-mono text-xs">
                  {tailscale.progress || "Connecting..."}
                </span>
              </div>
            ) : (
              <div className="flex-1 w-full flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
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
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2/40 border border-border-subtle text-xs text-text-muted font-mono mt-1">
            <span className="material-symbols-outlined text-[15px] text-text-muted shrink-0" aria-hidden="true">
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
