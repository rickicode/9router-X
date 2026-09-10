"use client";

import { useState, useMemo, useEffect } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import Input from "@/shared/components/Input";
import { cn } from "@/shared/utils/cn";

function timeAgo(timestamp) {
  if (!timestamp) return "just now";
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{timeAgo(timestamp)}</>;
}

const fmt = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
};

export default function RealtimeRequestsCard({
  activeRequests = [],
  recentRequests = [],
  className,
}) {
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const filteredRecents = useMemo(() => {
    return recentRequests.filter((r) => {
      const isOk = !r.status || r.status === "ok" || r.status === "success";
      if (filterType === "streaming" && !r.isStream) return false;
      if (filterType === "json" && r.isStream) return false;
      if (filterType === "success" && !isOk) return false;
      if (filterType === "failed" && isOk) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const m = (r.model || "").toLowerCase();
        const p = (r.provider || "").toLowerCase();
        const k = (r.apiKey || "").toLowerCase();
        if (!m.includes(q) && !p.includes(q) && !k.includes(q)) return false;
      }
      return true;
    });
  }, [recentRequests, filterType, search]);

  const streamCount = useMemo(
    () => recentRequests.filter((r) => r.isStream).length,
    [recentRequests],
  );
  const jsonCount = useMemo(
    () => recentRequests.filter((r) => !r.isStream).length,
    [recentRequests],
  );

  return (
    <Card
      title="Realtime Request Stream & Live Activity"
      subtitle="Live request stream dengan info status (sedang stream / selesai), format (Stream / JSON), model, provider, dan API key yang dipakai"
      icon="stream"
      padding="md"
      className={cn("flex min-w-0 flex-col gap-4 overflow-hidden", className)}
      action={
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
          <span className="text-xs font-semibold text-success font-mono uppercase tracking-wider">
            Live Stream
          </span>
        </div>
      }
    >
      {/* Active In-Flight Requests (Sedang Stream) */}
      {activeRequests.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-brand-500/5 border border-brand-500/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-brand-500">
                Sedang Stream ({activeRequests.length} active)
              </span>
            </div>
            <span className="text-[11px] text-text-muted">
              Live processing in-flight
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1">
            {activeRequests.map((req, idx) => (
              <div
                key={req.id || idx}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/80 border border-brand-500/30 p-2.5 shadow-xs"
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded bg-brand-500/20 text-brand-600 dark:text-brand-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      <span className="material-symbols-outlined !text-[12px] leading-none">
                        wifi_tethering
                      </span>
                      {req.isStream ? "Sedang Stream" : "Sedang JSON"}
                    </span>
                    <Badge variant="neutral" size="sm">
                      {req.provider}
                    </Badge>
                  </div>
                  <span
                    className="font-mono text-xs font-bold text-text-main truncate mt-1"
                    title={req.model}
                  >
                    {req.model}
                  </span>
                  <span className="text-[10px] text-text-muted flex items-center gap-1 truncate">
                    <span className="material-symbols-outlined !text-[11px]">
                      key
                    </span>
                    {req.apiKey || req.account || "Default Key"}
                  </span>
                </div>
                <div className="shrink-0 flex flex-col items-end">
                  <span className="text-[10px] font-mono text-text-muted">
                    <TimeAgo timestamp={req.startedAt} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control Bar: Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: "all", label: "All", count: recentRequests.length },
            { id: "streaming", label: "Stream", count: streamCount },
            { id: "json", label: "JSON", count: jsonCount },
            {
              id: "success",
              label: "Success",
              count: recentRequests.filter(
                (r) => !r.status || r.status === "ok" || r.status === "success",
              ).length,
            },
            {
              id: "failed",
              label: "Failed",
              count: recentRequests.filter(
                (r) => r.status && r.status !== "ok" && r.status !== "success",
              ).length,
            },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilterType(pill.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer select-none",
                filterType === pill.id
                  ? "bg-surface-3 border border-border text-text-main font-semibold shadow-xs"
                  : "bg-surface-1 border border-border-subtle text-text-muted hover:text-text-main hover:bg-surface-2",
              )}
            >
              <span>{pill.label}</span>
              <span className="text-[10px] opacity-70 font-mono">
                ({pill.count})
              </span>
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            aria-label="Filter realtime requests"
            placeholder="Search model, provider, apikey..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs h-8"
          />
        </div>
      </div>

      {/* Full-width Request Stream Table */}
      {!filteredRecents.length ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border text-xs text-text-muted">
          {recentRequests.length === 0
            ? "Waiting for incoming requests... SSE live listener active."
            : "No requests match the selected filter."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-1/50">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-text-muted font-semibold text-[11px]">
                <th className="py-2.5 px-3 w-8 text-center">Status</th>
                <th className="py-2.5 px-3 w-24">Type</th>
                <th className="py-2.5 px-3 w-28">Stream State</th>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3 w-28">Provider</th>
                <th className="py-2.5 px-3 w-36">API Key</th>
                <th className="py-2.5 px-3 text-right w-28 whitespace-nowrap">
                  Tokens In/Out
                </th>
                <th className="py-2.5 px-3 text-right w-24 whitespace-nowrap">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredRecents.map((r, i) => {
                const isOk =
                  !r.status || r.status === "ok" || r.status === "success";

                return (
                  <tr
                    key={i}
                    className="hover:bg-surface-2/60 transition-colors"
                  >
                    {/* Status Dot + Text */}
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center size-5 rounded-full",
                          isOk
                            ? "bg-emerald-500/10 text-success"
                            : "bg-rose-500/10 text-danger",
                        )}
                        title={isOk ? "Success (200 OK)" : `Failed (${r.status})`}
                      >
                        <span className="material-symbols-outlined !text-[13px] leading-none">
                          {isOk ? "check" : "close"}
                        </span>
                      </span>
                    </td>

                    {/* Format Type (STREAM vs JSON) */}
                    <td className="py-2 px-3">
                      {r.isStream ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-500">
                          <span className="material-symbols-outlined !text-[11px]">
                            wifi_tethering
                          </span>
                          STREAM
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                          <span className="material-symbols-outlined !text-[11px]">
                            code
                          </span>
                          JSON
                        </span>
                      )}
                    </td>

                    {/* Stream State (Sedang Stream vs Selesai) */}
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <span className="size-1.5 rounded-full bg-text-muted/60" />
                        Selesai
                      </span>
                    </td>

                    {/* Model */}
                    <td className="py-2 px-3 font-mono font-medium text-text-main truncate max-w-[200px]" title={r.model}>
                      {r.model}
                    </td>

                    {/* Provider */}
                    <td className="py-2 px-3">
                      <Badge variant="neutral" size="sm">
                        {r.provider || "unknown"}
                      </Badge>
                    </td>

                    {/* API Key */}
                    <td className="py-2 px-3 truncate max-w-[150px]" title={r.rawApiKey || r.apiKey}>
                      <span className="inline-flex items-center gap-1 text-text-muted">
                        <span className="material-symbols-outlined !text-[12px]">
                          key
                        </span>
                        <span className="font-mono text-[11px] text-text-main truncate">
                          {r.apiKey || "Default Key"}
                        </span>
                      </span>
                    </td>

                    {/* Tokens */}
                    <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className="text-primary font-semibold">
                        {fmt(r.promptTokens)}↑
                      </span>{" "}
                      <span className="text-success font-semibold">
                        {fmt(r.completionTokens)}↓
                      </span>
                    </td>

                    {/* When */}
                    <td className="py-2 px-3 text-right text-text-muted whitespace-nowrap text-[11px]">
                      <TimeAgo timestamp={r.timestamp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
