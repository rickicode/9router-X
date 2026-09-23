"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import Card from "@/shared/components/Card";
import { formatMetric, fmtTokens, fmtNumber } from "./analyticsData";

const VIEW_MODES = [
  { value: "requests", label: "Requests", color: "bg-primary", accent: "text-primary" },
  { value: "tokens", label: "Tokens", color: "bg-cyan-500", accent: "text-cyan-400" },
  { value: "failures", label: "Failures", color: "bg-rose-500", accent: "text-rose-400" },
  { value: "latency", label: "Latency", color: "bg-amber-500", accent: "text-amber-400" },
];

const MAX_ROWS = 12;

function fmtValue(mode, value) {
  if (mode === "tokens") return fmtTokens(value);
  if (mode === "latency") return formatMetric(value, "latencyMs");
  return fmtNumber(value);
}

function getPointValue(point, mode) {
  if (!point) return 0;
  if (mode === "requests") return Number(point.requests || 0);
  if (mode === "tokens") return Number(point.inputTokens || 0) + Number(point.outputTokens || 0);
  if (mode === "failures") return Number(point.failures || 0);
  if (mode === "latency") return Number(point.p50LatencyMs || point.latencyMs || 0);
  return 0;
}

export default function AnalyticsBrickTimeline({ data = [] }) {
  const [viewMode, setViewMode] = useState("requests");
  const validPoints = data.filter((point) => point && point.timestamp);
  const mode = VIEW_MODES.find((m) => m.value === viewMode);

  if (!validPoints.length) {
    return (
      <Card title="Activity Grid" subtitle="Per-bucket volume as stacked blocks" icon="grid_view" padding="md">
        <div
          className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted"
          role="status"
        >
          No telemetry events recorded for this timeframe
        </div>
      </Card>
    );
  }

  const values = validPoints.map((point) => getPointValue(point, viewMode));
  const max = Math.max(...values, 1);
  const step = max > MAX_ROWS ? Math.ceil(max / MAX_ROWS) : 1;

  const totals = validPoints.reduce(
    (acc, point) => {
      acc.requests += Number(point.requests || 0);
      acc.tokens += Number(point.inputTokens || 0) + Number(point.outputTokens || 0);
      acc.failures += Number(point.failures || 0);
      return acc;
    },
    { requests: 0, tokens: 0, failures: 0 }
  );

  const peak = validPoints[values.indexOf(max)];

  return (
    <Card
      title="Activity Grid"
      subtitle="Each block equals a fixed share of the peak bucket — hover a column for the exact count"
      icon="grid_view"
      padding="md"
      className="flex min-w-0 flex-col gap-4 p-4 sm:p-4"
      action={
        <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar">
          {VIEW_MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setViewMode(option.value)}
              title={`Show ${option.label} as grid`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === option.value
                  ? "border-border bg-surface-3 text-text-main font-semibold"
                  : "border-transparent bg-surface text-text-muted hover:text-text-main"
              }`}
            >
              <span className={`size-2 rounded-[2px] ${option.color}`} />
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex min-w-0 gap-2.5">
        {/* Y axis: block scale */}
        <div className="flex shrink-0 flex-col-reverse justify-between py-0.5 text-right">
          {Array.from({ length: MAX_ROWS + 1 }, (_, rowIndex) => {
            const lineValue = rowIndex * step;
            const show = rowIndex % 3 === 0 || rowIndex === MAX_ROWS;
            return (
              <span
                key={rowIndex}
                className="font-mono text-[10px] leading-none text-text-muted"
                style={{ visibility: show ? "visible" : "hidden" }}
              >
                {fmtValue(viewMode, lineValue)}
              </span>
            );
          })}
        </div>

        {/* Grid plot area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="grid gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${Math.min(validPoints.length, 31)}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${MAX_ROWS}, minmax(0, 1fr))`,
              gridAutoFlow: "column",
            }}
            role="img"
            aria-label={`${mode.label} grid across ${validPoints.length} buckets, peak ${fmtValue(viewMode, max)}`}
          >
            {validPoints.slice(0, 31).map((point, columnIndex) => {
              const value = getPointValue(point, viewMode);
              const blocks = Math.min(MAX_ROWS, step > 0 ? Math.ceil(value / step) : value > 0 ? 1 : 0);
              const isFailure = viewMode === "failures";
              return Array.from({ length: MAX_ROWS }, (_, rowIndex) => {
                const filled = rowIndex < blocks;
                const dimmed = !filled;
                return (
                  <span
                    key={`${columnIndex}-${rowIndex}`}
                    title={
                      point.timestampLabel || point.timestamp
                        ? `${point.timestampLabel || point.timestamp}: ${fmtValue(viewMode, value)}`
                        : `${fmtValue(viewMode, value)}`
                    }
                    className={`aspect-square rounded-[2px] transition-colors ${
                      filled
                        ? isFailure
                          ? "bg-rose-500/85 hover:bg-rose-400"
                          : mode.color + " hover:opacity-80"
                        : "bg-surface-2 hover:bg-surface-3"
                    } ${dimmed ? "" : ""}`}
                  />
                );
              });
            })}
          </div>

          {/* X axis: bucket labels, thinned */}
          <div className="mt-2 flex min-w-0 justify-between gap-1 overflow-hidden">
            {validPoints.slice(0, 31).map((point, index) => {
              const total = validPoints.length;
              const showEvery = total > 20 ? Math.ceil(total / 8) : total > 10 ? 4 : 2;
              const show = index % showEvery === 0 || index === total - 1;
              if (!show) return <span key={index} className="h-3 shrink-0" style={{ flex: 1 }} />;
              return (
                <span
                  key={index}
                  className="h-3 shrink-0 truncate font-mono text-[10px] leading-tight text-text-muted"
                  style={{ flex: 1 }}
                >
                  {point.timestampLabel || compactLabel(point.timestamp)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend / scale readout */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-[2px] ${mode.color}`} />
          1 block ≈ {fmtValue(viewMode, step)}
        </span>
        <span>
          Peak <span className="font-medium tabular-nums text-text-main">{fmtValue(viewMode, max)}</span>
          {peak?.timestampLabel || peak?.timestamp ? ` · ${peak.timestampLabel || compactLabel(peak.timestamp)}` : ""}
        </span>
        {viewMode === "requests" && (
          <span>
            Total <span className="font-medium tabular-nums text-text-main">{fmtNumber(totals.requests)}</span>
          </span>
        )}
        {viewMode === "tokens" && (
          <span>
            Total <span className="font-medium tabular-nums text-text-main">{fmtTokens(totals.tokens)}</span>
          </span>
        )}
        {viewMode === "failures" && (
          <span>
            Total <span className="font-medium tabular-nums text-text-main">{fmtNumber(totals.failures)}</span>
          </span>
        )}
        <span className="ml-auto italic">Highest column touches the top row</span>
      </div>
    </Card>
  );
}

function compactLabel(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp).slice(5, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return String(timestamp).length > 13 ? `${month}/${day} ${hours}:${minutes}` : `${month}/${day}`;
}

AnalyticsBrickTimeline.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
};
