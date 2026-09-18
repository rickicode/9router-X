"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import FailureResponseModal from "./FailureResponseModal";

export default function FailureAnalyticsCard({
  data,
  onSelectModel,
  onSelectProvider,
  className,
}) {
  const [viewMode, setViewMode] = useState("models"); // "models" | "providers" | "recent"
  const [sortBy, setSortBy] = useState("failures"); // "failures" | "rate"
  const [search, setSearch] = useState("");
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState({ title: "", type: "model" });
  const [modalFailures, setModalFailures] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Recent failures tab state
  const [recentFailures, setRecentFailures] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Derive model failure stats
  const modelsWithFailures = useMemo(() => {
    if (!data?.models) return [];
    return data.models
      .map((m) => {
        const failures = Number(m.failures || m.failure_count || 0);
        const requests = Number(m.requests || m.count || 0);
        const failureRate = requests > 0 ? (failures / requests) * 100 : 0;
        return {
          ...m,
          failures,
          requests,
          failureRate,
        };
      })
      .filter((m) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          m.model?.toLowerCase().includes(s) ||
          m.provider?.toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        if (sortBy === "rate") {
          return b.failureRate - a.failureRate || b.failures - a.failures;
        }
        return b.failures - a.failures || b.failureRate - a.failureRate;
      });
  }, [data?.models, sortBy, search]);

  // Derive provider failure stats
  const providersWithFailures = useMemo(() => {
    if (!data?.byProvider) return [];
    return data.byProvider
      .map((p) => {
        const failures = Number(p.failureCount ?? p.failures ?? 0);
        const requests = Number(p.count ?? p.requests ?? 0);
        const failureRate = requests > 0 ? (failures / requests) * 100 : 0;
        return {
          ...p,
          failures,
          requests,
          failureRate,
        };
      })
      .filter((p) => {
        if (!search) return true;
        return p.provider?.toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => {
        if (sortBy === "rate") {
          return b.failureRate - a.failureRate || b.failures - a.failures;
        }
        return b.failures - a.failures || b.failureRate - a.failureRate;
      });
  }, [data?.byProvider, sortBy, search]);

  // Total failed attempts
  const totalFailures = useMemo(() => {
    return Number(data?.summary?.failureCount || 0);
  }, [data?.summary?.failureCount]);

  // Fetch recent failure traces
  const fetchRecentFailures = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch("/api/usage/analytics/failures?limit=30");
      if (res.ok) {
        const json = await res.json();
        setRecentFailures(json.recentFailures || []);
      }
    } catch (e) {
      console.error("Failed to fetch recent failures:", e);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  // When switching to "recent" tab, load failures
  useEffect(() => {
    if (viewMode === "recent") {
      fetchRecentFailures();
    }
  }, [viewMode, fetchRecentFailures]);

  // Open inspection modal for a specific model or provider
  const inspectFailures = async (target, type = "model") => {
    const title = type === "model" ? `${target.provider}/${target.model}` : target.provider;
    setModalTarget({ title, type });
    setIsModalOpen(true);
    setModalLoading(true);
    setModalFailures([]);

    try {
      const params = new URLSearchParams({
        limit: "25",
      });
      if (type === "model") {
        params.set("provider", target.provider);
        params.set("model", target.model);
      } else {
        params.set("provider", target.provider);
      }

      // First try /api/usage/analytics/failures
      const res = await fetch(`/api/usage/analytics/failures?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.recentFailures && json.recentFailures.length > 0) {
          setModalFailures(json.recentFailures);
          setModalLoading(false);
          return;
        }
      }

      // Fallback: /api/usage/request-details?status=failed
      const fallbackParams = new URLSearchParams({
        status: "failed",
        pageSize: "25",
      });
      if (type === "model") {
        fallbackParams.set("provider", target.provider);
        fallbackParams.set("model", target.model);
      } else {
        fallbackParams.set("provider", target.provider);
      }
      const fallbackRes = await fetch(`/api/usage/request-details?${fallbackParams.toString()}`);
      if (fallbackRes.ok) {
        const fbJson = await fallbackRes.json();
        setModalFailures(fbJson.details || []);
      }
    } catch (err) {
      console.error("Error inspecting failures:", err);
    } finally {
      setModalLoading(false);
    }
  };

  const getStatusBadgeVariant = (code) => {
    const num = Number(code);
    if (num === 429) return "warning";
    if (num >= 500) return "error";
    if (num >= 400) return "orange";
    return "error";
  };

  return (
    <>
      <Card
        title="Failure Intelligence & Error Responses"
        subtitle="Rank models and providers by failed requests and inspect their exact failure responses"
        icon="bug_report"
        padding="none"
        className={cn("flex min-w-0 flex-col overflow-hidden", className)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode("models")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors cursor-pointer",
                  viewMode === "models"
                    ? "bg-surface-1 text-text-main shadow-xs"
                    : "text-text-muted hover:text-text-main",
                )}
              >
                Failed Models
              </button>
              <button
                type="button"
                onClick={() => setViewMode("providers")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors cursor-pointer",
                  viewMode === "providers"
                    ? "bg-surface-1 text-text-main shadow-xs"
                    : "text-text-muted hover:text-text-main",
                )}
              >
                Failed Providers
              </button>
              <button
                type="button"
                onClick={() => setViewMode("recent")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1",
                  viewMode === "recent"
                    ? "bg-surface-1 text-danger shadow-xs"
                    : "text-text-muted hover:text-text-main",
                )}
              >
                <span className="material-symbols-outlined text-[13px]">terminal</span>
                Recent Responses
              </button>
            </div>
          </div>
        }
      >
        {/* Controls Bar */}
        <div className="p-3 sm:p-4 border-b border-border bg-surface-2/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  viewMode === "models"
                    ? "Filter model or provider…"
                    : viewMode === "providers"
                      ? "Filter provider name…"
                      : "Search failure traces…"
                }
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface-1 text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {viewMode !== "recent" && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted text-[11px] font-semibold uppercase">Sort:</span>
              <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setSortBy("failures")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors cursor-pointer",
                    sortBy === "failures"
                      ? "bg-surface-1 font-semibold text-text-main"
                      : "text-text-muted hover:text-text-main",
                  )}
                >
                  Most Failures
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy("rate")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors cursor-pointer",
                    sortBy === "rate"
                      ? "bg-surface-1 font-semibold text-text-main"
                      : "text-text-muted hover:text-text-main",
                  )}
                >
                  Highest Failure %
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        {totalFailures === 0 && viewMode !== "recent" ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-success text-3xl">
              verified
            </span>
            <p className="font-semibold text-sm text-text-main">
              Zero Request Failures Recorded
            </p>
            <p className="text-xs text-text-muted max-w-sm">
              All routed requests across all providers and models completed successfully in this period.
            </p>
          </div>
        ) : (
          <>
            {/* VIEW: FAILED MODELS */}
            {viewMode === "models" && (
              <>
                {/* Mobile Cards (<sm) */}
                <div className="sm:hidden data-cards">
                  {modelsWithFailures.map((m, idx) => (
                    <div key={`${m.provider}/${m.model}`} className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-5 rounded-full bg-surface-3 flex items-center justify-center font-mono font-bold text-[10px] text-text-muted shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-xs text-text-main break-all">
                              {m.model}
                            </h4>
                            <p className="text-[10px] text-text-muted font-mono">
                              {m.provider}
                            </p>
                          </div>
                        </div>
                        <Badge variant={m.failureRate > 20 ? "error" : m.failureRate > 5 ? "warning" : "neutral"} size="sm">
                          {m.failureRate.toFixed(1)}% fail
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2/60 rounded-lg p-2 border border-border/50">
                        <div>
                          <span className="text-[10px] text-text-muted block">Failed Requests</span>
                          <span className="font-mono font-bold text-danger text-sm">
                            {m.failures.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-text-muted block">Total Attempts</span>
                          <span className="font-mono font-semibold text-text-main text-sm">
                            {m.requests.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full min-h-[44px] flex items-center justify-center gap-1.5"
                        onClick={() => inspectFailures(m, "model")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-danger">
                          bug_report
                        </span>
                        Inspect Error Responses
                      </Button>
                    </div>
                  ))}
                  {!modelsWithFailures.length && (
                    <div className="p-6 text-center text-xs text-text-muted">
                      No models matching filter with failed requests.
                    </div>
                  )}
                </div>

                {/* Desktop Table (sm+) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="data-table w-full min-w-[800px] text-left text-xs" aria-label="Failed models ranking">
                    <thead className="text-[11px] uppercase font-semibold text-text-muted">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">#</th>
                        <th className="px-4 py-3">Model</th>
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Failed Requests</th>
                        <th className="px-4 py-3">Failure Rate</th>
                        <th className="px-4 py-3">Total Requests</th>
                        <th className="px-4 py-3 text-right">Error Payloads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelsWithFailures.map((m, idx) => (
                        <tr key={`${m.provider}/${m.model}`} className="hover:bg-surface-2/60 transition-colors">
                          <td className="px-4 py-3 text-center font-mono font-bold text-text-muted">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-semibold text-text-main">
                            <span
                              className="hover:text-brand-500 cursor-pointer break-all"
                              onClick={() => onSelectModel?.(m.provider, m.model)}
                              title="Filter by this model"
                            >
                              {m.model}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="neutral" size="sm">
                              {m.provider}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-danger">
                            {m.failures.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 max-w-[140px]">
                              <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    m.failureRate > 25 ? "bg-rose-500" : m.failureRate > 10 ? "bg-amber-500" : "bg-zinc-400",
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(m.failureRate, 2))}%` }}
                                />
                              </div>
                              <span className="font-mono font-bold text-[11px]">
                                {m.failureRate.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-text-muted">
                            {m.requests.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => inspectFailures(m, "model")}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                bug_report
                              </span>
                              View Responses
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!modelsWithFailures.length && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-text-muted">
                            No models matching filter with failed requests.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* VIEW: FAILED PROVIDERS */}
            {viewMode === "providers" && (
              <>
                {/* Mobile Cards (<sm) */}
                <div className="sm:hidden data-cards">
                  {providersWithFailures.map((p, idx) => (
                    <div key={p.provider} className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-5 rounded-full bg-surface-3 flex items-center justify-center font-mono font-bold text-[10px] text-text-muted shrink-0">
                            {idx + 1}
                          </span>
                          <h4 className="font-semibold text-xs text-text-main truncate">
                            {p.provider}
                          </h4>
                        </div>
                        <Badge variant={p.failureRate > 20 ? "error" : p.failureRate > 5 ? "warning" : "neutral"} size="sm">
                          {p.failureRate.toFixed(1)}% fail
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2/60 rounded-lg p-2 border border-border/50">
                        <div>
                          <span className="text-[10px] text-text-muted block">Failed Requests</span>
                          <span className="font-mono font-bold text-danger text-sm">
                            {p.failures.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-text-muted block">Total Attempts</span>
                          <span className="font-mono font-semibold text-text-main text-sm">
                            {p.requests.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {p.errorBreakdown && Object.keys(p.errorBreakdown).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(p.errorBreakdown).map(([cat, count]) => (
                            <span
                              key={cat}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-danger/10 text-danger border border-danger/20"
                            >
                              {cat}: {count}
                            </span>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full min-h-[44px] flex items-center justify-center gap-1.5"
                        onClick={() => inspectFailures(p, "provider")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-danger">
                          bug_report
                        </span>
                        Inspect Error Responses
                      </Button>
                    </div>
                  ))}
                  {!providersWithFailures.length && (
                    <div className="p-6 text-center text-xs text-text-muted">
                      No providers matching filter with failed requests.
                    </div>
                  )}
                </div>

                {/* Desktop Table (sm+) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="data-table w-full min-w-[800px] text-left text-xs" aria-label="Failed providers ranking">
                    <thead className="text-[11px] uppercase font-semibold text-text-muted">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">#</th>
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Failed Requests</th>
                        <th className="px-4 py-3">Failure Rate</th>
                        <th className="px-4 py-3">Total Requests</th>
                        <th className="px-4 py-3">Error Breakdown</th>
                        <th className="px-4 py-3 text-right">Error Payloads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providersWithFailures.map((p, idx) => (
                        <tr key={p.provider} className="hover:bg-surface-2/60 transition-colors">
                          <td className="px-4 py-3 text-center font-mono font-bold text-text-muted">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-semibold text-text-main">
                            <span
                              className="hover:text-brand-500 cursor-pointer"
                              onClick={() => onSelectProvider?.(p.provider)}
                              title="Filter by this provider"
                            >
                              {p.provider}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-danger">
                            {p.failures.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 max-w-[140px]">
                              <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    p.failureRate > 25 ? "bg-rose-500" : p.failureRate > 10 ? "bg-amber-500" : "bg-zinc-400",
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(p.failureRate, 2))}%` }}
                                />
                              </div>
                              <span className="font-mono font-bold text-[11px]">
                                {p.failureRate.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-text-muted">
                            {p.requests.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            {p.errorBreakdown && Object.keys(p.errorBreakdown).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(p.errorBreakdown).map(([cat, count]) => (
                                  <span
                                    key={cat}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-3 text-text-muted border border-border"
                                  >
                                    {cat}: {count}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => inspectFailures(p, "provider")}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                bug_report
                              </span>
                              View Responses
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!providersWithFailures.length && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-text-muted">
                            No providers matching filter with failed requests.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* VIEW: RECENT TRACES / PAYLOADS */}
            {viewMode === "recent" && (
              <div className="p-3 sm:p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium">
                    Showing latest archived failure responses and payloads
                  </span>
                  <button
                    type="button"
                    onClick={fetchRecentFailures}
                    disabled={recentLoading}
                    className="inline-flex items-center gap-1 text-xs text-brand-500 hover:underline cursor-pointer"
                  >
                    <span className={cn("material-symbols-outlined text-[15px]", recentLoading && "animate-spin")}>
                      refresh
                    </span>
                    Refresh
                  </button>
                </div>

                {recentLoading ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
                    <span className="material-symbols-outlined animate-spin text-xl text-brand-500">
                      progress_activity
                    </span>
                    Loading recent failure traces…
                  </div>
                ) : !recentFailures.length ? (
                  <div className="p-8 text-center text-xs text-text-muted border border-dashed border-border rounded-xl">
                    No recent failure traces recorded in database.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 border border-border rounded-xl bg-surface-1 overflow-hidden">
                    {recentFailures.map((item, idx) => {
                      const statusCode =
                        item.response?.status ||
                        item.statusCode ||
                        item.status ||
                        "500";
                      const errorSummary =
                        item.error ||
                        item.response?.error ||
                        item.response?.message ||
                        "Request failed";
                      const errorStr =
                        typeof errorSummary === "object"
                          ? errorSummary.message || JSON.stringify(errorSummary)
                          : String(errorSummary);

                      return (
                        <div key={item.id || idx} className="p-3.5 flex flex-col gap-2 hover:bg-surface-2/40 transition-colors">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={getStatusBadgeVariant(statusCode)} size="sm">
                                {statusCode}
                              </Badge>
                              <span className="font-semibold text-xs text-text-main">
                                {item.model || "Unknown model"}
                              </span>
                              <Badge variant="neutral" size="sm">
                                {item.provider || "Gateway"}
                              </Badge>
                            </div>

                            <span className="text-[11px] font-mono text-text-muted">
                              {item.timestamp ? new Date(item.timestamp).toLocaleString("en-US") : "Recent"}
                            </span>
                          </div>

                          <p className="text-xs font-medium text-danger break-words bg-danger/5 border border-danger/20 rounded p-2">
                            {errorStr}
                          </p>

                          {/* Raw response payload */}
                          <div className="relative mt-1">
                            <pre className="max-h-[140px] overflow-auto rounded border border-border bg-surface-2/80 p-2 text-[11px] font-mono text-text-main whitespace-pre-wrap break-all">
                              {JSON.stringify(item.response || item.providerResponse || item.error || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Failure Response Inspection Modal */}
      <FailureResponseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        targetTitle={modalTarget.title}
        targetType={modalTarget.type}
        failures={modalFailures}
        loading={modalLoading}
      />
    </>
  );
}
