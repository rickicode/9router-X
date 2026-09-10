"use client";

import { useEffect, useState, useCallback } from "react";
import GlobalAnalyticsChart from "./GlobalAnalyticsChart";
import AnalyticsTrendChart from "./AnalyticsTrendChart";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import { cn } from "@/shared/utils/cn";
import {
  fetchAnalytics,
  fetchAnalyticsWithComparison,
  rankModels,
  formatMetric,
  fmtNumber,
  fmtTokens,
  TIME_BUCKETS,
  defaultTimeBucket,
} from "./analyticsData";

const ERROR_METADATA = {
  upstream: {
    label: "Upstream Provider Error",
    description: "Provider returned HTTP 5xx or server connection failed.",
    variant: "error",
    icon: "cloud_off",
    color: "text-red-500",
    barColor: "bg-red-500",
  },
  rate_limit: {
    label: "Rate Limit / Quota Exceeded",
    description: "HTTP 429 Too Many Requests or token quota exhausted.",
    variant: "warning",
    icon: "speed",
    color: "text-yellow-500",
    barColor: "bg-yellow-500",
  },
  timeout: {
    label: "Gateway / Upstream Timeout",
    description: "Upstream exceeded response deadline or gateway timed out.",
    variant: "error",
    icon: "timer_off",
    color: "text-orange-500",
    barColor: "bg-orange-500",
  },
  auth: {
    label: "Authentication / Key Error",
    description: "Invalid API key, expired token, or forbidden (401/403).",
    variant: "error",
    icon: "key_off",
    color: "text-red-600",
    barColor: "bg-red-600",
  },
  cancelled: {
    label: "Client Cancelled",
    description: "Client aborted request or closed connection early.",
    variant: "default",
    icon: "cancel",
    color: "text-text-muted",
    barColor: "bg-text-muted",
  },
  stream: {
    label: "Stream Parsing Failure",
    description: "Corrupted SSE chunks or malformed JSON delta stream.",
    variant: "error",
    icon: "broken_image",
    color: "text-red-400",
    barColor: "bg-red-400",
  },
  internal: {
    label: "Internal Gateway Error",
    description: "Internal 9router pipeline error or uncaught exception.",
    variant: "error",
    icon: "dns",
    color: "text-red-500",
    barColor: "bg-red-500",
  },
  unknown: {
    label: "Uncategorized Failure",
    description: "Non-standard error or missing status code classification.",
    variant: "default",
    icon: "help_outline",
    color: "text-text-muted",
    barColor: "bg-text-muted",
  },
};

function DeltaBadge({
  diff,
  pct,
  unit = "",
  invert = false,
  label = "vs yesterday",
}) {
  if (diff == null && pct == null) return null;
  const isZero = pct !== null ? pct === 0 : diff === 0;
  const isPositive = pct !== null ? pct > 0 : diff > 0;

  const isGood = invert ? !isPositive && !isZero : isPositive && !isZero;

  const colorClass = isZero
    ? "text-text-muted bg-surface-2"
    : isGood
      ? "text-success bg-emerald-500/10"
      : "text-danger bg-rose-500/10";

  const icon = isZero
    ? "horizontal_rule"
    : isPositive
      ? "arrow_upward"
      : "arrow_downward";

  const formattedText =
    pct != null
      ? `${isPositive ? "+" : ""}${pct.toFixed(1)}%`
      : `${isPositive ? "+" : ""}${typeof diff === "number" ? (Number.isInteger(diff) ? diff : diff.toFixed(1)) : diff}${unit ? " " + unit : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium mt-0.5 self-start",
        colorClass,
      )}
      title={`Yesterday delta: ${diff != null ? diff : ""}`}
    >
      <span className="material-symbols-outlined text-[12px] leading-none">
        {icon}
      </span>
      <span>{formattedText}</span>
      <span className="text-text-muted text-[9px] ml-0.5">{label}</span>
    </span>
  );
}

export default function AnalyticsTab({ period }) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [errorCategory, setErrorCategory] = useState("");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [timeBucket, setTimeBucket] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  // Periodic Auto-Refresh
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      setRefresh((x) => x + 1);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval]);

  // Main Data Fetching
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setData(null);
    fetchAnalyticsWithComparison(
      { period, provider, model, errorCategory, timeBucket },
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, provider, model, errorCategory, timeBucket, refresh]);

  // Model selection shortcut
  const handleSelectModel = useCallback((p, m) => {
    setProvider(p);
    setModel(m);
    window.scrollTo({ top: 120, behavior: "smooth" });
  }, []);

  // CSV Export
  const handleExportCsv = () => {
    if (!data?.models?.length) return;
    const headers = [
      "Provider",
      "Model",
      "Requests",
      "Success",
      "Failed",
      "SuccessRate",
      "P50_ms",
      "P95_ms",
      "InputTokens",
      "OutputTokens",
    ];
    const rows = data.models.map((m) => [
      `"${m.provider}"`,
      `"${m.model}"`,
      m.requests,
      m.successes,
      m.failures,
      m.successRate != null ? `"${(m.successRate * 100).toFixed(2)}%"` : '""',
      m.latencyMs ?? "",
      m.p95 ?? "",
      m.inputTokens ?? "",
      m.outputTokens ?? "",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `9router-analytics-${period || "7d"}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = Boolean(provider || model || errorCategory);

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-6">
      {/* Header & Subtitle */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-500 text-2xl leading-none shrink-0 inline-flex items-center justify-center">
              monitoring
            </span>
            <h2 className="text-xl font-semibold text-text-main">
              Model Analytics
            </h2>
          </div>
          {data?.summary && (
            <span className="text-xs text-text-muted font-mono">
              Last updated: {new Date().toLocaleTimeString()}
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">
          New routed LLM attempts only. Retries count separately. Reliability
          and speed measure service performance, not answer quality. In-memory
          telemetry is best-effort; crashes or overload can drop events.
        </p>
      </div>

      {/* Filter Bar */}
      <Card padding="sm" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 w-full items-center gap-2 sm:flex-1 sm:min-w-[180px]">
            <Input
              aria-label="Provider filter"
              placeholder="Provider (exact ID)"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex min-w-0 w-full items-center gap-2 sm:flex-1 sm:min-w-[180px]">
            <Input
              aria-label="Model filter"
              placeholder="Model (exact ID)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Granularity (Request Stream resolution) */}
          <div className="flex items-center gap-1 bg-surface-2 rounded-[10px] p-1 border border-border-subtle">
            <span className="material-symbols-outlined text-[16px] text-text-muted ml-1.5">
              schedule
            </span>
            <select
              value={timeBucket}
              onChange={(e) => setTimeBucket(e.target.value)}
              className="bg-transparent text-xs text-text-main font-medium py-1 px-1.5 outline-none cursor-pointer"
              aria-label="Timeline granularity"
            >
              <option value="">
                Auto ({defaultTimeBucket(period)})
              </option>
              {TIME_BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Auto Refresh Dropdown */}
          <div className="flex items-center gap-1 bg-surface-2 rounded-[10px] p-1 border border-border-subtle">
            <span className="material-symbols-outlined text-[16px] text-text-muted ml-1.5">
              timer
            </span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-xs text-text-main font-medium py-1 px-1.5 outline-none cursor-pointer"
              aria-label="Auto refresh interval"
            >
              <option value={0}>Auto: Off</option>
              <option value={15}>Auto: 15s</option>
              <option value={30}>Auto: 30s</option>
              <option value={60}>Auto: 60s</option>
            </select>
            {autoRefreshInterval > 0 && (
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
            )}
          </div>

          {/* Export CSV */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={!data?.models?.length}
            className="rounded-[10px] border border-border p-2 px-3 text-xs"
            title="Download CSV report"
          >
            <span className="material-symbols-outlined text-[16px] mr-1">
              download
            </span>
            CSV
          </Button>

          {/* Refresh button */}
          <Button
            variant="secondary"
            className="rounded-[10px] border border-border p-2 px-4"
            onClick={() => setRefresh((x) => x + 1)}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[18px] mr-1",
                loading && "animate-spin",
              )}
            >
              refresh
            </span>
            Refresh
          </Button>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle text-xs">
            <span className="text-text-muted font-medium">Active filters:</span>
            {provider && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 text-text-main border border-border [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
                Provider: <strong>{provider}</strong>
                <button
                  type="button"
                  onClick={() => setProvider("")}
                  className="hover:text-danger ml-0.5"
                  aria-label="Remove provider filter"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            )}
            {model && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 text-text-main border border-border [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
                Model: <strong>{model}</strong>
                <button
                  type="button"
                  onClick={() => setModel("")}
                  className="hover:text-danger ml-0.5"
                  aria-label="Remove model filter"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            )}
            {errorCategory && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
                Error:{" "}
                <strong>
                  {ERROR_METADATA[errorCategory]?.label || errorCategory}
                </strong>
                <button
                  type="button"
                  onClick={() => setErrorCategory("")}
                  className="hover:text-danger ml-0.5"
                  aria-label="Remove error category filter"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setProvider("");
                setModel("");
                setErrorCategory("");
              }}
              className="text-text-muted hover:text-danger underline ml-2"
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* Loading & Error States */}
      {loading && (
        <Card
          padding="lg"
          className="flex items-center justify-center p-12 text-text-muted text-sm"
        >
          <span className="material-symbols-outlined animate-spin mr-2">
            progress_activity
          </span>
          Loading analytics…
        </Card>
      )}

      {error && (
        <Card
          padding="md"
          className="border-red-500/30 bg-red-500/5 text-red-500"
        >
          <p role="alert" className="font-medium text-sm">
            {error}
          </p>
        </Card>
      )}

      {data && (
        <>
          {/* Top Overview Cards */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
            <Card
              className="flex min-w-0 flex-col gap-1 px-4 py-3"
              padding="none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Total Attempts
                </span>
                <span className="material-symbols-outlined text-text-muted text-[18px] leading-none shrink-0 inline-flex items-center justify-center">
                  swap_calls
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-text-main">
                {fmtNumber(data.summary.totalEvents)}
              </span>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted truncate">
                  {data.models.length} active models tracked
                </span>
                {data.comparison?.totalEvents && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      Yesterday:{" "}
                      <span className="font-mono font-semibold text-text-main">
                        {data.comparison.totalEvents.yesterdayFormatted}
                      </span>
                    </span>
                    <DeltaBadge
                      diff={data.comparison.totalEvents.diff}
                      pct={data.comparison.totalEvents.pct}
                      label={data.comparison.baselineLabel}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="flex min-w-0 flex-col gap-1 px-4 py-3"
              padding="none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Success Rate
                </span>
                <span className="material-symbols-outlined text-success text-[18px] leading-none shrink-0 inline-flex items-center justify-center">
                  verified
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-success">
                {data.summary.successRate}%
              </span>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted truncate">
                  {fmtNumber(data.summary.successCount)} successful attempts
                </span>
                {data.comparison?.successRate && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      Yesterday:{" "}
                      <span className="font-mono font-semibold text-text-main">
                        {data.comparison.successRate.yesterdayFormatted}
                      </span>
                    </span>
                    <DeltaBadge
                      diff={data.comparison.successRate.diff}
                      unit="%"
                      label={data.comparison.baselineLabel}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="flex min-w-0 flex-col gap-1 px-4 py-3"
              padding="none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Failed Attempts
                </span>
                <span className="material-symbols-outlined text-danger text-[18px] leading-none shrink-0 inline-flex items-center justify-center">
                  error
                </span>
              </div>
              <span
                className={cn(
                  "truncate text-2xl font-bold font-mono",
                  data.summary.failureCount > 0
                    ? "text-danger"
                    : "text-text-muted",
                )}
              >
                {fmtNumber(data.summary.failureCount)}
              </span>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted truncate">
                  {data.summary.totalEvents
                    ? (
                        (data.summary.failureCount / data.summary.totalEvents) *
                        100
                      ).toFixed(1)
                    : 0}
                  % failure rate
                </span>
                {data.comparison?.failureCount && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      Yesterday:{" "}
                      <span className="font-mono font-semibold text-text-main">
                        {data.comparison.failureCount.yesterdayFormatted}
                      </span>
                    </span>
                    <DeltaBadge
                      diff={data.comparison.failureCount.diff}
                      pct={data.comparison.failureCount.pct}
                      invert
                      label={data.comparison.baselineLabel}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="flex min-w-0 flex-col gap-1 px-4 py-3"
              padding="none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Median Latency
                </span>
                <span className="material-symbols-outlined text-warning text-[18px] leading-none shrink-0 inline-flex items-center justify-center">
                  speed
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-warning">
                {formatMetric(data.summary.p50LatencyMs, "latencyMs")}
              </span>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted truncate">
                  P95: {formatMetric(data.summary.p95LatencyMs, "latencyMs")}
                </span>
                {data.comparison?.p50LatencyMs && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      Yesterday:{" "}
                      <span className="font-mono font-semibold text-text-main">
                        {data.comparison.p50LatencyMs.yesterdayFormatted}
                      </span>
                    </span>
                    <DeltaBadge
                      diff={data.comparison.p50LatencyMs.diff}
                      unit="ms"
                      invert
                      label={data.comparison.baselineLabel}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="flex min-w-0 flex-col gap-1 px-4 py-3"
              padding="none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Total Tokens
                </span>
                <span className="material-symbols-outlined text-info text-[18px] leading-none shrink-0 inline-flex items-center justify-center">
                  data_usage
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-info">
                {fmtTokens(
                  data.summary.totalInputTokens +
                    data.summary.totalOutputTokens,
                )}
              </span>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted truncate">
                  In: {fmtTokens(data.summary.totalInputTokens)} · Out:{" "}
                  {fmtTokens(data.summary.totalOutputTokens)}
                </span>
                {data.comparison?.totalTokens && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      Yesterday:{" "}
                      <span className="font-mono font-semibold text-text-main">
                        {data.comparison.totalTokens.yesterdayFormatted}
                      </span>
                    </span>
                    <DeltaBadge
                      diff={data.comparison.totalTokens.diff}
                      pct={data.comparison.totalTokens.pct}
                      label={data.comparison.baselineLabel}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {!data.models.length ? (
            <Card padding="lg" className="text-center">
              <p className="text-text-muted">
                No events recorded in this period. New requests will appear
                after recording starts.
              </p>
            </Card>
          ) : (
            <>
              {/* Dedicated Global Full-Width Chart */}
              <GlobalAnalyticsChart
                data={data.series}
                summary={data.summary}
                yesterdaySummary={data.yesterdaySummary}
              />

              {/* Error Distribution Section (Interactive Cards) */}
              <Card
                title="Error Distribution & Root Causes"
                subtitle="Click any error category below to filter all metrics and models to that specific issue"
                icon="report_problem"
                padding="md"
              >
                {!data.errors.length ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400">
                    <span className="material-symbols-outlined text-2xl">
                      check_circle
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm">
                        Zero Failures Recorded
                      </h4>
                      <p className="text-xs text-text-muted">
                        All model requests in this period completed
                        successfully.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted uppercase font-semibold">
                          Total Failures:
                        </span>
                        <span className="text-sm font-bold text-danger font-mono">
                          {fmtNumber(data.summary.failureCount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">
                          Failure rate:
                        </span>
                        <Badge variant="error" size="sm">
                          {data.summary.totalEvents
                            ? `${(
                                (data.summary.failureCount /
                                  data.summary.totalEvents) *
                                100
                              ).toFixed(1)}%`
                            : "0%"}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {data.errors.map((row) => {
                        const meta =
                          ERROR_METADATA[row.error_category] ||
                          ERROR_METADATA.unknown;
                        const totalFailures = data.summary.failureCount || 1;
                        const pct = (row.count / totalFailures) * 100;
                        const isSelected = errorCategory === row.error_category;

                        return (
                          <button
                            type="button"
                            key={row.error_category}
                            onClick={() =>
                              setErrorCategory((prev) =>
                                prev === row.error_category
                                  ? ""
                                  : row.error_category,
                              )
                            }
                            className={cn(
                              "flex min-w-0 flex-col justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer group",
                              isSelected
                                ? "border-brand-500 bg-brand-500/10 shadow-sm ring-2 ring-brand-500/40"
                                : "border-border-subtle bg-surface-2/40 hover:bg-surface-2/80 hover:border-brand-500/30",
                            )}
                          >
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "material-symbols-outlined text-[18px] leading-none shrink-0 inline-flex items-center justify-center",
                                      meta.color,
                                    )}
                                  >
                                    {meta.icon}
                                  </span>
                                  <span className="font-semibold text-sm text-text-main break-words">
                                    {meta.label}
                                  </span>
                                </div>
                                <Badge
                                  variant={
                                    isSelected ? "primary" : meta.variant
                                  }
                                  size="sm"
                                >
                                  {isSelected ? "Filtered" : row.error_category}
                                </Badge>
                              </div>

                              <div className="flex items-baseline justify-between gap-2 mt-2">
                                <span className="text-2xl font-bold font-mono text-text-main">
                                  {fmtNumber(row.count)}
                                </span>
                                <span className="text-xs font-semibold text-text-muted">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>

                              <div className="w-full bg-border-subtle h-1.5 rounded-full overflow-hidden mt-2">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    meta.barColor,
                                  )}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between mt-3">
                              <p className="text-[11px] text-text-muted line-clamp-1">
                                {meta.description}
                              </p>
                              <span className="text-[11px] text-brand-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                                {isSelected ? "Remove filter" : "Filter"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>

              {/* Ranking Cards (Fastest, Most Reliable, Most Used) */}
              <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
                {[
                  [
                    "fastest",
                    "Fastest Models",
                    "speed",
                    `P50 latency (min. ${data.minSamples} samples)`,
                  ],
                  [
                    "reliable",
                    "Most Reliable",
                    "verified",
                    `Highest success rate (min. ${data.minSamples} samples)`,
                  ],
                  [
                    "used",
                    "Most Used",
                    "trending_up",
                    "Highest total routed requests",
                  ],
                ].map(([mode, title, icon, subtitle]) => {
                  const ranked = rankModels(data.models, mode, data.minSamples);
                  return (
                    <Card
                      key={mode}
                      padding="sm"
                      title={title}
                      subtitle={subtitle}
                      icon={icon}
                      className="flex min-w-0 flex-col justify-between"
                    >
                      {!ranked.length ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border text-xs text-text-muted my-2">
                          <span className="material-symbols-outlined text-sm">
                            info
                          </span>
                          <span>
                            Insufficient samples (min. {data.minSamples})
                          </span>
                        </div>
                      ) : (
                        <ol className="divide-y divide-border-subtle my-1">
                          {ranked.slice(0, 5).map((row, idx) => (
                            <li
                              key={`${row.provider}/${row.model}`}
                              onClick={() =>
                                handleSelectModel(row.provider, row.model)
                              }
                              className="flex items-center justify-between py-2 gap-2 text-xs cursor-pointer hover:bg-surface-2/60 rounded px-1 -mx-1 transition-colors"
                              title="Click to zoom into this model"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="size-5 rounded-full bg-surface-2 flex items-center justify-center font-mono font-bold text-[10px] text-text-muted shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-text-main truncate hover:text-brand-500">
                                    {row.model}
                                  </p>
                                  <p className="text-[10px] text-text-muted truncate">
                                    {row.provider}
                                  </p>
                                </div>
                              </div>
                              <span className="font-mono font-bold text-text-main shrink-0">
                                {formatMetric(
                                  row[
                                    mode === "fastest"
                                      ? "latencyMs"
                                      : mode === "reliable"
                                        ? "successRate"
                                        : "requests"
                                  ],
                                  mode === "fastest"
                                    ? "latencyMs"
                                    : mode === "reliable"
                                      ? "successRate"
                                      : "count",
                                )}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Detailed Model Performance Table in a Card */}
              <Card
                title="Model Performance Breakdown"
                subtitle="Click any row to filter timeline and metrics specifically for that model"
                icon="table_chart"
                padding="none"
                className="overflow-hidden"
              >
                <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-surface-2/60 text-text-muted text-xs uppercase font-semibold">
                      <tr>
                        {[
                          "Model & Provider",
                          "Requests",
                          "Success",
                          "Failed",
                          "Success Rate",
                          "P50 Latency",
                          "P95 Latency",
                          "Input Tokens",
                          "Output Tokens",
                        ].map((v) => (
                          <th className="px-4 py-3" key={v}>
                            {v}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {data.models.map((row) => (
                        <tr
                          key={`${row.provider}/${row.model}`}
                          onClick={() =>
                            handleSelectModel(row.provider, row.model)
                          }
                          className="hover:bg-surface-2/60 transition-colors cursor-pointer group"
                          title="Click to zoom into this model"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text-main group-hover:text-brand-500 transition-colors">
                              {row.model}
                            </div>
                            <div className="text-xs text-text-muted font-mono">
                              {row.provider}
                            </div>
                            {row.requests < data.minSamples && (
                              <span className="text-[10px] text-text-muted italic">
                                Insufficient samples
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {fmtNumber(row.requests)}
                          </td>
                          <td className="px-4 py-3 font-mono text-success">
                            {fmtNumber(row.successes)}
                          </td>
                          <td className="px-4 py-3 font-mono text-danger">
                            {fmtNumber(row.failures)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                row.successRate >= 0.98
                                  ? "success"
                                  : row.successRate >= 0.9
                                    ? "warning"
                                    : "error"
                              }
                              size="sm"
                            >
                              {formatMetric(row.successRate, "successRate")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {formatMetric(row.latencyMs, "latencyMs")}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-muted">
                            {formatMetric(row.p95, "latencyMs")}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-muted">
                            {row.inputTokens != null
                              ? fmtTokens(row.inputTokens)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-muted">
                            {row.outputTokens != null
                              ? fmtTokens(row.outputTokens)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Individual Metric Drill-Downs */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-text-main">
                    Metric Drilldowns
                  </h3>
                  <span className="text-xs text-text-muted">
                    Individual component charts
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-6">
                  <AnalyticsTrendChart
                    title="Request volume"
                    data={data.series}
                    metricKey="requests"
                    color="#60a5fa"
                    unit="count"
                    chartType="area"
                  />
                  <AnalyticsTrendChart
                    title="Success rate"
                    data={data.series}
                    metricKey="successRate"
                    color="#34d399"
                    unit="successRate"
                  />
                  <AnalyticsTrendChart
                    title="Successful latency P50"
                    data={data.series}
                    metricKey="latencyMs"
                    color="#fbbf24"
                    unit="latencyMs"
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
