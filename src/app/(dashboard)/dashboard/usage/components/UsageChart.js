"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
 AreaChart,
 Area,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
 Legend,
} from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
 const num = Number(n) || 0;
 if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
 if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
 return String(num);
};

const fmtCost = (n) => `$${(Number(n) || 0).toFixed(4)}`;

export default function UsageChart({ period = "7d" }) {
 const [data, setData] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);
 const [viewMode, setViewMode] = useState("tokens");

 const fetchData = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/usage/chart?period=${period}`);
 if (!res.ok) {
 throw new Error(`Failed to fetch chart data (${res.status})`);
 }
 const json = await res.json();
 setData(json);
 } catch (e) {
 console.error("Failed to fetch chart data:", e);
 setError(e.message || "Failed to fetch chart data");
 } finally {
 setLoading(false);
 }
 }, [period]);

 useEffect(() => {
 fetchData();
 }, [fetchData]);

 const hasData = data.some((d) => d.tokens > 0 || d.cost > 0);

 return (
 <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-3">
 <div className="grid w-full grid-cols-2 items-center gap-1 rounded-sm border border-border bg-surface-2 size-8 sm:w-auto sm:self-start h-8">
 <button
 onClick={() => setViewMode("tokens")}
 className={`px-3 py-1 rounded-sm text-sm font-medium ${viewMode === "tokens" ? "bg-primary text-white " : "text-text-muted hover:text-text hover:bg-surface-2"}`}
 >
 Tokens
 </button>
 <button
 onClick={() => setViewMode("cost")}
 className={`px-3 py-1 rounded-sm text-sm font-medium ${viewMode === "cost" ? "bg-primary text-white " : "text-text-muted hover:text-text hover:bg-surface-2"}`}
 >
 Cost
 </button>
 </div>

 {error ? (
 <div className="h-48 flex flex-col items-center justify-center gap-2 text-danger text-sm" role="alert">
 <div className="flex items-center gap-1.5 font-medium">
 <span className="material-symbols-outlined text-[18px]">error</span>
 <span>{error}</span>
 </div>
 <button
 type="button"
 onClick={fetchData}
 className="px-3 py-1 rounded-sm text-xs border border-danger/30 bg-danger/10 hover:bg-danger/10 text-text-main"
 >
 Retry
 </button>
 </div>
 ) : loading ? (
 <div className="h-48 flex items-center justify-center text-text-muted text-sm" role="status" aria-live="polite">Loading...</div>
 ) : !hasData ? (
 <div className="h-48 flex items-center justify-center text-text-muted text-sm" role="status">No data for this period</div>
 ) : (
 <div
 role="region"
 aria-label={`Usage trend chart for ${period} period showing ${viewMode === "tokens" ? "tokens" : "cost"}`}
 tabIndex={0}
 className="focus-visible:outline-none rounded-sm"
 >
 <div className="sr-only">
 {`Interactive usage chart for ${period} showing ${viewMode === "tokens" ? "token consumption" : "cost"} over time.`}
 </div>
 <ResponsiveContainer width="100%" height={220}>
 <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
 <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
 </linearGradient>
 <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
 <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
 <XAxis
 dataKey="label"
 tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
 tickLine={false}
 axisLine={false}
 interval="preserveStartEnd"
 />
 <YAxis
 tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
 tickLine={false}
 axisLine={false}
 tickFormatter={viewMode === "tokens" ? fmtTokens : fmtCost}
 width={50}
 />
 <Tooltip
 contentStyle={{
 backgroundColor: "var(--color-bg)",
 border: "1px solid var(--color-border)",
 borderRadius: "8px",
 fontSize: "12px",
 }}
 formatter={(value, name) =>
 name === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Cost"]
 }
 />
 {viewMode === "tokens" ? (
 <Area
 type="monotone"
 dataKey="tokens"
 stroke="#6366f1"
 strokeWidth={2}
 fill="url(#gradTokens)"
 dot={false}
 activeDot={{ r: 4 }}
 />
 ) : (
 <Area
 type="monotone"
 dataKey="cost"
 stroke="#f59e0b"
 strokeWidth={2}
 fill="url(#gradCost)"
 dot={false}
 activeDot={{ r: 4 }}
 />
 )}
 </AreaChart>
 </ResponsiveContainer>
 </div>
 )}
 </Card>
 );
}

UsageChart.propTypes = {
 period: PropTypes.string,
};
