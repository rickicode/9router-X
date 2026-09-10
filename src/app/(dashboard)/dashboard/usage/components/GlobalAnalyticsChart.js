"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import { formatMetric, fmtTokens, fmtNumber } from "./analyticsData";

const tooltipStyle = {
  backgroundColor: "var(--color-surface, #18181b)",
  border: "1px solid var(--color-border, #27272a)",
  borderRadius: "10px",
  color: "var(--color-text-main, #f4f4f5)",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  padding: "10px 14px",
};

export default function GlobalAnalyticsChart({
  data = [],
  summary,
  yesterdaySummary,
}) {
  const [viewMode, setViewMode] = useState("traffic");
  const [showYesterday, setShowYesterday] = useState(true);

  const validPoints = data.filter((item) => item.timestamp);
  const hasData = validPoints.length > 0;
  const hasYesterdaySeries = validPoints.some(
    (item) => item.yesterdayRequests > 0 || item.yesterdayTokens > 0,
  );

  const viewOptions = [
    { value: "traffic", label: "Traffic Breakdown", icon: "stacked_bar_chart" },
    { value: "successRate", label: "Success Rate %", icon: "verified" },
    { value: "latency", label: "Latency (P50 / P95)", icon: "speed" },
    { value: "tokens", label: "Token Volume", icon: "data_usage" },
  ];

  return (
    <Card
      title="Global Performance & Traffic Timeline"
      subtitle="Aggregated time-series telemetry across all models and providers"
      icon="monitoring"
      padding="md"
      className="flex min-w-0 flex-col gap-4 p-3 sm:p-6"
      action={
        <div className="flex min-w-0 max-w-full items-center gap-2 flex-wrap sm:flex-nowrap">
          <SegmentedControl
            options={viewOptions}
            value={viewMode}
            onChange={setViewMode}
            size="sm"
            className="flex-wrap w-full min-w-0 gap-1 [&>button]:min-w-0 [&>button]:h-auto [&>button]:min-h-10 [&>button>span:last-child]:whitespace-normal [&_.material-symbols-outlined]:w-4 [&_.material-symbols-outlined]:overflow-hidden"
          />
          <button
            type="button"
            onClick={() => setShowYesterday((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
              showYesterday
                ? "bg-surface-3 border-border text-text-main font-semibold shadow-xs"
                : "bg-surface-1 border-border-subtle text-text-muted hover:text-text-main"
            }`}
            title="Toggle Yesterday comparison line"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                showYesterday ? "text-brand-500" : "text-text-muted"
              }`}
            >
              compare_arrows
            </span>
            <span>vs Yesterday</span>
            {showYesterday && (
              <span className="size-1.5 rounded-full bg-brand-500 ml-0.5" />
            )}
          </button>
        </div>
      }
    >
      {!hasData ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-xs text-text-muted">
          No telemetry events recorded for this timeframe
        </div>
      ) : (
        <div className="h-[300px] min-w-0 w-full sm:h-[420px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {viewMode === "traffic" ? (
              <ComposedChart
                data={validPoints}
                margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="gradGlobalSuccess"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient
                    id="gradGlobalFailure"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="timestamp"
                  minTickGap={24}
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtNumber}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    fmtNumber(value),
                    name === "successes"
                      ? "Successful Attempts"
                      : name === "failures"
                        ? "Failed Attempts"
                        : name === "yesterdayRequests"
                          ? "Yesterday Requests"
                          : name,
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-text-muted font-medium ml-1">
                      {value === "successes"
                        ? "Successful Attempts"
                        : value === "failures"
                          ? "Failed Attempts"
                          : value === "yesterdayRequests"
                            ? "Yesterday Requests (vs)"
                            : value}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="successes"
                  name="successes"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#gradGlobalSuccess)"
                  stackId="traffic"
                />
                <Area
                  type="monotone"
                  dataKey="failures"
                  name="failures"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fill="url(#gradGlobalFailure)"
                  stackId="traffic"
                />
                {showYesterday && (
                  <Line
                    type="monotone"
                    dataKey="yesterdayRequests"
                    name="yesterdayRequests"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}
              </ComposedChart>
            ) : viewMode === "successRate" ? (
              <ComposedChart
                data={validPoints}
                margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="gradGlobalRate"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="timestamp"
                  minTickGap={24}
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 1]}
                  tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    value != null ? `${(value * 100).toFixed(1)}%` : "No data",
                    name === "yesterdaySuccessRate"
                      ? "Yesterday Success Rate"
                      : "Success Rate",
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-text-muted font-medium ml-1">
                      {value === "successRate"
                        ? "Success Rate"
                        : value === "yesterdaySuccessRate"
                          ? "Yesterday Success Rate (vs)"
                          : value}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="successRate"
                  name="successRate"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#gradGlobalRate)"
                  connectNulls={false}
                />
                {showYesterday && (
                  <Line
                    type="monotone"
                    dataKey="yesterdaySuccessRate"
                    name="yesterdaySuccessRate"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            ) : viewMode === "latency" ? (
              <LineChart
                data={validPoints}
                margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="timestamp"
                  minTickGap={24}
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val} ms`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    value != null
                      ? `${Number(value).toFixed(0)} ms`
                      : "No data",
                    name === "latencyMs"
                      ? "P50 Median Latency"
                      : name === "p95"
                        ? "P95 Latency"
                        : name === "yesterdayLatencyMs"
                          ? "Yesterday P50 Latency"
                          : name,
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-text-muted font-medium ml-1">
                      {value === "latencyMs"
                        ? "P50 Median Latency"
                        : value === "p95"
                          ? "P95 Latency"
                          : value === "yesterdayLatencyMs"
                            ? "Yesterday P50 Latency (vs)"
                            : value}
                    </span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="latencyMs"
                  name="latencyMs"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  name="p95"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
                {showYesterday && (
                  <Line
                    type="monotone"
                    dataKey="yesterdayLatencyMs"
                    name="yesterdayLatencyMs"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            ) : (
              <ComposedChart
                data={validPoints}
                margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradGlobalIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient
                    id="gradGlobalOut"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EC4899" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="timestamp"
                  minTickGap={24}
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: "currentColor",
                    fillOpacity: 0.55,
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtTokens}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    fmtTokens(value),
                    name === "inputTokens"
                      ? "Prompt (Input) Tokens"
                      : name === "outputTokens"
                        ? "Completion (Output) Tokens"
                        : name === "yesterdayTokens"
                          ? "Yesterday Total Tokens"
                          : name,
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-text-muted font-medium ml-1">
                      {value === "inputTokens"
                        ? "Input Tokens"
                        : value === "outputTokens"
                          ? "Output Tokens"
                          : value === "yesterdayTokens"
                            ? "Yesterday Tokens (vs)"
                            : value}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="inputTokens"
                  name="inputTokens"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fill="url(#gradGlobalIn)"
                />
                <Area
                  type="monotone"
                  dataKey="outputTokens"
                  name="outputTokens"
                  stroke="#EC4899"
                  strokeWidth={2}
                  fill="url(#gradGlobalOut)"
                />
                {showYesterday && (
                  <Line
                    type="monotone"
                    dataKey="yesterdayTokens"
                    name="yesterdayTokens"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

GlobalAnalyticsChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
  summary: PropTypes.object,
  yesterdaySummary: PropTypes.object,
};
