"use client";

import { useState, useEffect, useCallback } from "react";
import {
 AreaChart,
 Area,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
} from "recharts";
import { Card, Button } from "@/shared/components";

const fmtTokens = (n) => {
 if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
 if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
 return String(n || 0);
};

const fmtUptime = (ms) => {
 if (!ms || ms <= 0) return "—";
 const m = Math.floor(ms / 60000);
 const h = Math.floor(m / 60);
 return h > 0 ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

const WINDOW_TABS = [
 { id: "today", label: "Today" },
 { id: "yesterday", label: "Yesterday" },
 { id: "last7d", label: "7 days" },
 { id: "last30d", label: "30 days" },
 { id: "all", label: "All time" },
];

const REASON_LABELS = {
 applied: "Prompt exceeded threshold",
 below_threshold: "Below size threshold",
 not_profitable: "Compression not profitable",
 below_min_chars: "Below minimum chars",
 below_min_tokens: "Below minimum tokens",
 unsupported_model: "Model not in allowlist",
 unsupported_format: "Non-Claude request format",
 timeout: "Compression timed out",
 transform_error: "Transform error",
 passthrough: "Passthrough",
 disabled: "Disabled",
 not_installed: "Not installed",
};

function SummaryCard({ label, value, sub, tone }) {
 return (
 <Card className="p-3">
 <p className="text-xs text-text-muted">{label}</p>
 <p className={`text-xl font-semibold mt-1 ${tone || ""}`}>{value}</p>
 {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
 </Card>
 );
}

export default function PxpipeClient() {
 const [status, setStatus] = useState(null);
 const [health, setHealth] = useState(null);
 const [stats, setStats] = useState(null);
 const [logs, setLogs] = useState(null);
 const [windowId, setWindowId] = useState("last7d");
 const [loading, setLoading] = useState(true);

 const refresh = useCallback(async () => {
 setLoading(true);
 try {
 const [statusRes, statsRes, logsRes] = await Promise.all([
 fetch("/api/pxpipe/status", { headers: { "Cache-Control": "no-store" } }),
 fetch("/api/pxpipe/stats"),
 fetch("/api/pxpipe/logs?limit=50"),
 ]);
 setStatus(await statusRes.json());
 setStats(await statsRes.json());
 setLogs(await logsRes.json());
 const healthRes = await fetch("/api/pxpipe/health", { method: "POST" });
 setHealth(await healthRes.json());
 } catch {
 /* sections render placeholders */
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) refresh();
 });
 return () => { cancelled = true; };
 }, [refresh]);

 const w = stats?.windows?.[windowId];
 const statusLabel = !status
 ? "—"
 : !status.installed
 ? "Not installed"
 : health?.healthy
 ? "Healthy"
 : status.running
 ? "Running"
 : "Stopped";

 return (
 <div className="flex w-full flex-col gap-3">
 <div className="flex items-center justify-between flex-wrap gap-3">
 <h2 className="text-sm font-semibold flex items-center gap-2">
 <span className="material-symbols-outlined text-primary">image</span>
 PXPIPE Dashboard
 </h2>
 <div className="flex items-center gap-2">
 <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
 {loading ? "Refreshing…" : "Refresh"}
 </Button>
 </div>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
 <SummaryCard
 label="Status"
 value={statusLabel}
 tone={health?.healthy ? "text-success" : status?.installed ? "text-warning" : "text-text-muted"}
 sub={status?.enabled ? "Enabled in pipeline" : "Disabled in pipeline"}
 />
 <SummaryCard label="Version" value={status?.version ? `v${status.version}` : "—"} sub="pxpipe-proxy" />
 <SummaryCard label="Uptime" value={fmtUptime(status?.uptimeMs)} sub="module loaded" />
 <SummaryCard label="Requests" value={w ? w.requests.toLocaleString() : "—"} />
 <SummaryCard label="Compressed" value={w ? w.compressed.toLocaleString() : "—"} tone="text-success" />
 <SummaryCard label="Bypassed" value={w ? w.bypassed.toLocaleString() : "—"} />
 </div>

 <Card className="p-3">
 <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
 <h3 className="font-medium">Token savings (estimated)</h3>
 <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 size-8 h-8">
 {WINDOW_TABS.map((tab) => (
 <button
 key={tab.id}
 onClick={() => setWindowId(tab.id)}
 className={`px-3 py-1 rounded-sm text-xs font-medium ${
 windowId === tab.id
 ? "bg-primary text-white "
 : "text-text-muted hover:text-text hover:bg-surface-2"
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>
 </div>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
 <div>
 <p className="text-xs text-text-muted">Original tokens</p>
 <p className="text-sm font-semibold">{w ? fmtTokens(w.tokensBeforeEst) : "—"}</p>
 </div>
 <div>
 <p className="text-xs text-text-muted">After PXPIPE</p>
 <p className="text-sm font-semibold">{w ? fmtTokens(w.tokensAfterEst) : "—"}</p>
 </div>
 <div>
 <p className="text-xs text-text-muted">Saved</p>
 <p className="text-sm font-medium text-success">{w ? fmtTokens(w.tokensSavedEst) : "—"}</p>
 </div>
 <div>
 <p className="text-xs text-text-muted">Reduction</p>
 <p className="text-sm font-medium text-success">{w ? `${w.savedPct}%` : "—"}</p>
 </div>
 </div>
 <p className="text-xs text-text-muted mt-3">
 Estimates from body size before/after imaging; billed usage per request
 (recorded on the Usage page) remains the ground truth. Images generated:{" "}
 {w ? w.imagesGenerated.toLocaleString() : "—"} · avg compression time:{" "}
 {w ? `${w.avgCompressionMs}ms` : "—"} · errors: {w ? w.errors : "—"}
 </p>
 </Card>

 <Card className="p-3">
 <h3 className="font-medium mb-3">Tokens saved — last 30 days</h3>
 {stats?.timeline?.some((d) => d.tokensSavedEst > 0) ? (
 <div
 role="region"
 aria-label="Tokens saved timeline chart"
 tabIndex={0}
 className="focus-visible:outline-none rounded-sm"
 >
 <div className="sr-only">
 {`Tokens saved timeline chart showing ${stats.timeline?.length || 0} data points.`}
 </div>
 <ResponsiveContainer width="100%" height={220}>
 <AreaChart data={stats.timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="gradPxpipe" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
 <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
 <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
 <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtTokens} width={48} />
 <Tooltip formatter={(v) => [fmtTokens(v), "Tokens saved"]} labelFormatter={(d) => d} />
 <Area type="monotone" dataKey="tokensSavedEst" stroke="#10b981" fill="url(#gradPxpipe)" strokeWidth={2} />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 ) : (
 <div className="h-32 flex items-center justify-center text-text-muted text-sm" role="status">
 No savings recorded yet — enable PXPIPE in the Token Saver and route a large Claude-format request.
 </div>
 )}
 </Card>

 <Card className="p-3">
 <h3 className="font-medium mb-3">History</h3>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="text-left text-xs text-text-muted border-b border-border">
 <th className="h-8 pr-3 text-xs font-medium text-text-muted">Time</th>
 <th className="h-8 pr-3 text-xs font-medium text-text-muted">Model</th>
 <th className="h-8 pr-3 text-right text-xs font-medium text-text-muted">Original</th>
 <th className="h-8 pr-3 text-right text-xs font-medium text-text-muted">Compressed</th>
 <th className="h-8 pr-3 text-right text-xs font-medium text-text-muted">Saved</th>
 <th className="h-8 pr-3 text-right text-xs font-medium text-text-muted">%</th>
 <th className="h-8 pr-3 text-right text-xs font-medium text-text-muted">Duration</th>
 <th className="h-8 text-xs font-medium text-text-muted">Status</th>
 </tr>
 </thead>
 <tbody>
 {(stats?.recent || []).slice(0, 50).map((ev, i) => (
 <tr key={`${ev.ts}-${i}`} className="border-b border-border">
 <td className="py-2 pr-3 whitespace-nowrap text-text-muted h-8 px-3 text-sm">
 {new Date(ev.ts).toLocaleString()}
 </td>
 <td className="py-2 pr-3 font-mono text-xs h-8 px-3 text-sm">{ev.provider ? `${ev.provider}/${ev.model}` : ev.model || "—"}</td>
 <td className="py-2 pr-3 text-right font-mono text-xs h-8 px-3 text-sm">
 {ev.applied ? fmtTokens(ev.tokensBeforeEst) : "—"}
 </td>
 <td className="py-2 pr-3 text-right font-mono text-xs h-8 px-3 text-sm">
 {ev.applied ? fmtTokens(ev.tokensAfterEst) : "—"}
 </td>
 <td className="py-2 pr-3 text-right font-mono text-xs text-success h-8 px-3 text-sm">
 {ev.applied ? fmtTokens(ev.tokensSavedEst) : "—"}
 </td>
 <td className="py-2 pr-3 text-right font-mono text-xs h-8 px-3 text-sm">
 {ev.applied ? `${ev.savedPct}%` : "—"}
 </td>
 <td className="py-2 pr-3 text-right font-mono text-xs h-8 px-3 text-sm">
 {ev.durationMs != null ? `${ev.durationMs}ms` : "—"}
 </td>
 <td className="py-2 h-8 px-3 text-sm">
 <span
 className={`text-xs px-2 py-1 rounded-sm ${
 ev.applied
 ? "bg-success/10 text-success"
 : ev.reason === "transform_error" || ev.reason === "timeout"
 ? "bg-danger/10 text-danger"
 : "bg-warning/10 text-warning"
 }`}
 title={ev.detail || ""}
 >
 {ev.applied ? "Compressed" : REASON_LABELS[ev.reason] || ev.reason}
 </span>
 </td>
 </tr>
 ))}
 {(!stats?.recent || stats.recent.length === 0) && (
 <tr>
 <td colSpan={8} className="py-3 text-center text-text-muted text-sm h-8 px-3">
 No PXPIPE activity yet
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </Card>

 <Card className="p-3" id="logs">
 <h3 className="font-medium mb-3">PXPIPE Logs</h3>
 {logs?.installLog ? (
 <pre className="rounded-sm bg-surface p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap border border-border text-text-main">
 {logs.installLog}
 </pre>
 ) : (
 <p className="text-sm text-text-muted">No install log yet.</p>
 )}
 </Card>
 </div>
 );
}
