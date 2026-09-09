"use client";

import PropTypes from "prop-types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Card from "@/shared/components/Card";
import { formatMetric } from "./analyticsData";

const tooltipStyle = {
  backgroundColor: "var(--color-bg, #18181b)",
  border: "1px solid var(--color-border, #27272a)",
  borderRadius: "8px",
  color: "var(--color-text, #f4f4f5)",
  fontSize: "12px",
};

export default function AnalyticsTrendChart({
  title,
  data,
  metricKey,
  unit,
  color,
  chartType = "line",
}) {
  const validPoints = data.filter(
    (item) => item[metricKey] !== null && item[metricKey] !== undefined,
  );
  const hasData = validPoints.length > 0;

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text-main">{title}</h3>
        <span className="text-xs text-text-muted">
          {hasData ? `${validPoints.length} points` : "No data"}
        </span>
      </div>

      {!hasData ? (
        <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted">
          No data recorded for this metric
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={420}>
          {chartType === "area" ? (
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={`grad-${metricKey}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.55 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.55 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) =>
                  unit === "successRate" ? `${(val * 100).toFixed(0)}%` : val
                }
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val) => [formatMetric(val, unit), title]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area
                type="monotone"
                dataKey={metricKey}
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${metricKey})`}
                connectNulls={false}
              />
            </AreaChart>
          ) : (
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.55 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.55 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => {
                  if (unit === "successRate")
                    return `${(val * 100).toFixed(0)}%`;
                  if (unit === "latencyMs") return `${val}ms`;
                  return val;
                }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val) => [formatMetric(val, unit), title]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Line
                type="monotone"
                dataKey={metricKey}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Card>
  );
}

AnalyticsTrendChart.propTypes = {
  title: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  metricKey: PropTypes.string.isRequired,
  unit: PropTypes.string,
  color: PropTypes.string.isRequired,
  chartType: PropTypes.oneOf(["line", "area"]),
};
