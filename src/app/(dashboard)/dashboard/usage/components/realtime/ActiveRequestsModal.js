"use client";

import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import { TimeAgo } from "./realtimeHelpers";

export default function ActiveRequestsModal({ isOpen, onClose, activeRequests = [] }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={null}
      size="full"
      showTrafficLights={true}
      className="sm:max-w-[760px]"
    >
      <div className="flex flex-col gap-4">
        {/* Header inside modal */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 animate-ping opacity-60"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
            </span>
            <h3 className="text-base font-bold text-text-main">
              Active In-Flight Requests
            </h3>
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300 text-xs font-bold tabular-nums">
              {activeRequests.length}
            </span>
          </div>
          <span className="text-[11px] text-text-muted flex items-center gap-1">
            <span className="material-symbols-outlined !text-[14px]">schedule</span>
            Live — auto-refresh
          </span>
        </div>

        {/* Empty state */}
        {activeRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 rounded-xl border border-dashed border-border gap-2">
            <span className="material-symbols-outlined text-[32px] text-text-muted/50">cloud_done</span>
            <span className="text-sm text-text-muted">No active in-flight requests</span>
          </div>
        ) : (
          /* Table layout */
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs" aria-label="Active in-flight requests">
              <thead>
                <tr className="bg-surface-2/60 text-text-muted font-semibold text-[11px] uppercase tracking-wide">
                  <th scope="col" className="text-left px-3 py-2.5">Status</th>
                  <th scope="col" className="text-left px-3 py-2.5">Model</th>
                  <th scope="col" className="text-left px-3 py-2.5">Provider</th>
                  <th scope="col" className="text-left px-3 py-2.5">Account</th>
                  <th scope="col" className="text-left px-3 py-2.5">API Key</th>
                  <th scope="col" className="text-right px-3 py-2.5">Elapsed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {activeRequests.map((req, idx) => (
                  <tr
                    key={req.id || idx}
                    className="hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded bg-brand-500/15 text-brand-600 dark:text-brand-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        <span className="material-symbols-outlined !text-[12px] leading-none">
                          {req.isStream ? "wifi_tethering" : "code"}
                        </span>
                        {req.isStream ? "STREAM" : "JSON"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-medium text-text-main truncate max-w-[220px]" title={req.model}>
                      {req.model}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="neutral" size="sm">{req.provider}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-text-main truncate max-w-[180px]" title={req.account || "Direct request"}>
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[13px] text-text-muted">account_circle</span>
                        {req.account || "Direct request"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 truncate max-w-[150px]" title={req.clientApiKey || req.apiKey || "Default Key"}>
                      <span className="inline-flex items-center gap-1 font-mono text-text-muted">
                        <span className="material-symbols-outlined !text-[13px]">key</span>
                        {req.clientApiKey || req.apiKey || "Default"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-muted tabular-nums">
                      <TimeAgo timestamp={req.startedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-2 text-[11px] text-text-muted pt-1 border-t border-border/40">
          <span className="material-symbols-outlined !text-[14px]">info</span>
          <span>Live updates active. Close modal to pause polling.</span>
        </div>
      </div>
    </Modal>
  );
}
