"use client";

import { useEffect, useState } from "react";
import GlobalAnalyticsChart from "./GlobalAnalyticsChart";
import AnalyticsTrendChart from "./AnalyticsTrendChart";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import { cn } from "@/shared/utils/cn";
import {
  fetchAnalytics,
  rankModels,
  formatMetric,
  fmtNumber,
  fmtTokens,
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

export default function AnalyticsTab({ period }) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetchAnalytics({ period, provider, model }, controller.signal)
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
  }, [period, provider, model, refresh]);

  return (
    <section className="flex flex-col gap-6">
      {/* Header & Subtitle */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-brand-500 text-2xl">
            monitoring
          </span>
          <h2 className="text-xl font-semibold text-text-main">
            Model Analytics
          </h2>
        </div>
        <p className="text-sm text-text-muted">
          New routed LLM attempts only. Retries count separately. Reliability
          and speed measure service performance, not answer quality. In-memory
          telemetry is best-effort; crashes or overload can drop events.
        </p>
      </div>

      {/* Filter Bar */}
      <Card padding="sm" className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Input
            aria-label="Provider filter"
            placeholder="Provider (exact ID)"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Input
            aria-label="Model filter"
            placeholder="Model (exact ID)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full"
          />
        </div>
        {(provider || model) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProvider("");
              setModel("");
            }}
            className="text-xs text-text-muted hover:text-text-main"
          >
            Clear Filters
          </Button>
        )}
        <Button
          variant="secondary"
          className="rounded-[10px] border border-border p-2 px-4"
          onClick={() => setRefresh((x) => x + 1)}
        >
          Refresh
        </Button>
      </Card>

      {/* States */}
      {loading && (
        <Card padding="lg" className="flex items-center justify-center p-12 text-text-muted text-sm">
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
            <Card className="flex min-w-0 flex-col gap-1 px-4 py-3" padding="none">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Total Attempts
                </span>
                <span className="material-symbols-outlined text-text-muted text-[18px]">
                  swap_calls
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-text-main">
                {fmtNumber(data.summary.totalEvents)}
              </span>
              <span className="text-[11px] text-text-muted truncate">
                {data.models.length} active models tracked
              </span>
            </Card>

            <Card className="flex min-w-0 flex-col gap-1 px-4 py-3" padding="none">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Success Rate
                </span>
                <span className="material-symbols-outlined text-success text-[18px]">
                  verified
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-success">
                {data.summary.successRate}%
              </span>
              <span className="text-[11px] text-text-muted truncate">
                {fmtNumber(data.summary.successCount)} successful attempts
              </span>
            </Card>

            <Card className="flex min-w-0 flex-col gap-1 px-4 py-3" padding="none">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Failed Attempts
                </span>
                <span className="material-symbols-outlined text-danger text-[18px]">
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
              <span className="text-[11px] text-text-muted truncate">
                {data.summary.totalEvents
                  ? (
                      (data.summary.failureCount / data.summary.totalEvents) *
                      100
                    ).toFixed(1)
                  : 0}
                % failure rate
              </span>
            </Card>

            <Card className="flex min-w-0 flex-col gap-1 px-4 py-3" padding="none">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Median Latency
                </span>
                <span className="material-symbols-outlined text-warning text-[18px]">
                  speed
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-warning">
                {formatMetric(data.summary.p50LatencyMs, "latencyMs")}
              </span>
              <span className="text-[11px] text-text-muted truncate">
                P95: {formatMetric(data.summary.p95LatencyMs, "latencyMs")}
              </span>
            </Card>

            <Card className="flex min-w-0 flex-col gap-1 px-4 py-3" padding="none">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs uppercase font-semibold">
                  Total Tokens
                </span>
                <span className="material-symbols-outlined text-info text-[18px]">
                  data_usage
                </span>
              </div>
              <span className="truncate text-2xl font-bold font-mono text-info">
                {fmtTokens(
                  data.summary.totalInputTokens +
                    data.summary.totalOutputTokens,
                )}
              </span>
              <span className="text-[11px] text-text-muted truncate">
                In: {fmtTokens(data.summary.totalInputTokens)} · Out:{" "}
                {fmtTokens(data.summary.totalOutputTokens)}
              </span>
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
              />

              {/* Error Distribution Section (Card) */}
              <Card
                title="Error Distribution & Root Causes"
                subtitle="Categorized failure events and status classification across all models"
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
                        All model requests in this period completed successfully.
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
                        const totalFailures =
                          data.summary.failureCount || 1;
                        const pct = (row.count / totalFailures) * 100;

                        return (
                          <div
                            key={row.error_category}
                            className="flex flex-col justify-between p-3.5 rounded-xl border border-border-subtle bg-surface-2/40 hover:bg-surface-2/70 transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "material-symbols-outlined text-[18px]",
                                      meta.color,
                                    )}
                                  >
                                    {meta.icon}
                                  </span>
                                  <span className="font-semibold text-sm text-text-main truncate">
                                    {meta.label}
                                  </span>
                                </div>
                                <Badge variant={meta.variant} size="sm">
                                  {row.error_category}
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

                            <p className="text-[11px] text-text-muted mt-3 line-clamp-2">
                              {meta.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>

              {/* Ranking Cards (Fastest, Most Reliable, Most Used) */}
              <div className="grid gap-4 md:grid-cols-3">
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
                  const ranked = rankModels(
                    data.models,
                    mode,
                    data.minSamples,
                  );
                  return (
                    <Card
                      key={mode}
                      padding="sm"
                      title={title}
                      subtitle={subtitle}
                      icon={icon}
                      className="flex flex-col justify-between"
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
                              className="flex items-center justify-between py-2 gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="size-5 rounded-full bg-surface-2 flex items-center justify-center font-mono font-bold text-[10px] text-text-muted shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-text-main truncate">
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
                subtitle="Granular latency, throughput, and error metrics across all registered models"
                icon="table_chart"
                padding="none"
                className="overflow-hidden"
              >
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full text-left text-sm">
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
                          className="hover:bg-surface-2/40 transition-colors"
                          key={`${row.provider}/${row.model}`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text-main">
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
                <div className="flex items-center justify-between">
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
