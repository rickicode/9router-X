"use client";

import { useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { cn } from "@/shared/utils/cn";

const ERROR_CATEGORY_LABELS = {
  upstream: { label: "Upstream 5xx", color: "bg-rose-500", textColor: "text-rose-600 dark:text-rose-400" },
  rate_limit: { label: "Rate Limit 429", color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
  auth: { label: "Auth 401/403", color: "bg-purple-500", textColor: "text-purple-600 dark:text-purple-400" },
  timeout: { label: "Timeout 408/504", color: "bg-sky-500", textColor: "text-sky-600 dark:text-sky-400" },
  cancelled: { label: "Cancelled 499", color: "bg-slate-500", textColor: "text-slate-500 dark:text-slate-400" },
  stream: { label: "Stream Error", color: "bg-orange-500", textColor: "text-orange-600 dark:text-orange-400" },
  internal: { label: "Internal 500", color: "bg-red-600", textColor: "text-red-600 dark:text-red-400" },
  unknown: { label: "Unknown", color: "bg-zinc-500", textColor: "text-zinc-500 dark:text-zinc-400" },
};

const fmt = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
};

const fmtMs = (ms) => {
  if (!ms && ms !== 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
};

function SuccessBar({ rate }) {
  const pct = Math.min(100, Math.max(0, Number(rate) || 0));
  const color =
    pct >= 95 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[11px] font-bold tabular-nums shrink-0",
          pct >= 95
            ? "text-success"
            : pct >= 80
            ? "text-warning"
            : "text-danger",
        )}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function ErrorBreakdownRow({ errorBreakdown, totalFailures }) {
  const entries = Object.entries(errorBreakdown).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <span className="text-text-muted text-[11px]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([cat, count]) => {
        const meta = ERROR_CATEGORY_LABELS[cat] || ERROR_CATEGORY_LABELS.unknown;
        return (
          <span
            key={cat}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border",
              cat === "upstream" ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
              cat === "rate_limit" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
              cat === "auth" ? "bg-purple-500/10 border-purple-500/20 text-purple-500" :
              cat === "timeout" ? "bg-sky-500/10 border-sky-500/20 text-sky-500" :
              cat === "cancelled" ? "bg-slate-500/10 border-slate-500/20 text-slate-400" :
              cat === "stream" ? "bg-orange-500/10 border-orange-500/20 text-orange-500" :
              cat === "internal" ? "bg-red-600/10 border-red-600/20 text-red-500" :
              "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
            )}
            title={`${meta.label}: ${count} errors`}
          >
            {meta.label}
            <span className="opacity-80">×{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function TopProvidersCard({ byProvider = [], onProviderClick, className }) {
  const [sortBy, setSortBy] = useState("count");

  const sorted = useMemo(() => {
    return [...byProvider].sort((a, b) => {
      if (sortBy === "count") return b.count - a.count;
      if (sortBy === "success_rate") return b.successRate - a.successRate;
      if (sortBy === "failures") return b.failureCount - a.failureCount;
      if (sortBy === "latency") return (a.p50LatencyMs ?? Infinity) - (b.p50LatencyMs ?? Infinity);
      if (sortBy === "tokens") return (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens);
      return b.count - a.count;
    });
  }, [byProvider, sortBy]);

  const maxCount = useMemo(() => Math.max(...byProvider.map((r) => r.count), 1), [byProvider]);

  const sortOptions = [
    { id: "count", label: "Requests" },
    { id: "success_rate", label: "Success Rate" },
    { id: "failures", label: "Errors" },
    { id: "latency", label: "Latency" },
    { id: "tokens", label: "Tokens" },
  ];

  if (!byProvider.length) {
    return (
      <Card
        title="Top Providers"
        icon="hub"
        padding="md"
        className={cn("flex min-w-0 flex-col gap-4", className)}
      >
        <div className="flex h-32 items-center justify-center text-xs text-text-muted">
          No provider data in selected time range.
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Top Providers"
      subtitle="Request volume, success rate, latency, dan error breakdown per provider"
      icon="hub"
      padding="md"
      className={cn("flex min-w-0 flex-col gap-4 overflow-hidden", className)}
      action={
        <div className="flex items-center gap-1 flex-wrap">
          {sortOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer",
                sortBy === opt.id
                  ? "bg-surface-3 text-text-main font-semibold border border-border shadow-xs"
                  : "text-text-muted hover:text-text-main",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-text-muted font-semibold text-[11px]">
              <th className="py-2.5 px-3 w-8 text-center">#</th>
              <th className="py-2.5 px-3">Provider</th>
              <th className="py-2.5 px-3 w-24 text-right">Requests</th>
              <th className="py-2.5 px-3 w-48">Success Rate</th>
              <th className="py-2.5 px-3 w-20 text-right">Errors</th>
              <th className="py-2.5 px-3 w-20 text-right">P50</th>
              <th className="py-2.5 px-3 w-20 text-right">P95</th>
              <th className="py-2.5 px-3 w-24 text-right">Tokens</th>
              <th className="py-2.5 px-3">Error Breakdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sorted.map((row, i) => {
              const barWidth = Math.round((row.count / maxCount) * 100);
              return (
                <tr
                  key={row.provider}
                  className="hover:bg-surface-2/60 transition-colors group"
                >
                  {/* Rank */}
                  <td className="py-2.5 px-3 text-center text-text-muted font-mono text-[11px]">
                    {i + 1}
                  </td>

                  {/* Provider name + volume bar */}
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => onProviderClick?.(row.provider)}
                      className="flex flex-col gap-1 min-w-0 w-full text-left cursor-pointer"
                      title={`Filter by ${row.provider}`}
                    >
                      <span className="font-semibold text-text-main group-hover:text-primary transition-colors truncate">
                        {row.provider}
                      </span>
                      <div className="h-1 rounded-full bg-surface-3 overflow-hidden w-full max-w-[140px]">
                        <div
                          className="h-full rounded-full bg-brand-500/50"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </button>
                  </td>

                  {/* Requests */}
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-text-main">
                    {fmt(row.count)}
                  </td>

                  {/* Success Rate bar */}
                  <td className="py-2.5 px-3">
                    <SuccessBar rate={row.successRate} />
                  </td>

                  {/* Errors */}
                  <td className="py-2.5 px-3 text-right">
                    {row.failureCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-danger">
                        <span className="material-symbols-outlined !text-[12px]">close</span>
                        {fmt(row.failureCount)}
                      </span>
                    ) : (
                      <span className="text-success font-semibold">—</span>
                    )}
                  </td>

                  {/* P50 latency */}
                  <td className="py-2.5 px-3 text-right font-mono text-text-muted text-[11px]">
                    {fmtMs(row.p50LatencyMs)}
                  </td>

                  {/* P95 latency */}
                  <td className="py-2.5 px-3 text-right font-mono text-text-muted text-[11px]">
                    {fmtMs(row.p95LatencyMs)}
                  </td>

                  {/* Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono text-text-muted text-[11px]">
                    {fmt(row.totalInputTokens + row.totalOutputTokens)}
                  </td>

                  {/* Error breakdown */}
                  <td className="py-2.5 px-3">
                    <ErrorBreakdownRow
                      errorBreakdown={row.errorBreakdown}
                      totalFailures={row.failureCount}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
