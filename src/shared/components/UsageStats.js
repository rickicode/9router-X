"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { buildUsageProviderList } from "@/shared/utils/usageProviders";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
 const p = AI_PROVIDERS[id];
 if (!p?.serviceKinds) return true;
 return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import Card from "./Card";
import SegmentedControl from "./SegmentedControl";
import { OVERVIEW_SUBTABS, resolveActiveSubTab } from "@/lib/usageOverview";
export { OVERVIEW_SUBTABS, resolveActiveSubTab };
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";
import RealtimeRequestsCard from "@/app/(dashboard)/dashboard/usage/components/RealtimeRequestsCard";

// Lazy-load: keeps @xyflow/react and recharts out of the initial bundle to optimize LCP
const ProviderTopology = dynamic(
 () => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"),
 {
 ssr: false,
 loading: () => (
 <div className="flex h-[320px] w-full min-w-0 items-center justify-center rounded-sm border border-border bg-surface-2 sm:h-[480px]">
 <span className="material-symbols-outlined text-[32px] animate-spin text-text-muted">
 progress_activity
 </span>
 </div>
 ),
 }
);

const UsageChart = dynamic(
 () => import("@/app/(dashboard)/dashboard/usage/components/UsageChart"),
 {
 ssr: false,
 loading: () => (
 <Card className="flex h-72 min-w-0 items-center justify-center p-3">
 <span className="material-symbols-outlined text-[32px] animate-spin text-text-muted">
 progress_activity
 </span>
 </Card>
 ),
 }
);

function timeAgo(timestamp) {
 const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
 if (diff < 60) return `${diff}s ago`;
 if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
 if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
 return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every 30 seconds without re-rendering parent (throttled from 1s to reduce CPU/battery drain)
// Tick pauses while the tab is hidden so background timers never churn.
function TimeAgo({ timestamp }) {
 const [, setTick] = useState(0);

 useEffect(() => {
 const timer = setInterval(() => {
 if (typeof document !== "undefined" && document.hidden) return; // pause hidden
 setTick(t => t + 1);
 }, 30000);
 const onVisibility = () => {
 if (typeof document !== "undefined" && !document.hidden) setTick(t => t + 1); // catch-up on return
 };
 if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
 return () => {
 clearInterval(timer);
 if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
 };
 }, []);

 return <>{timeAgo(timestamp)}</>;
}

// Inline styles hoisted as module consts → stable object identity across renders
const RECENT_REQUESTS_CARD_STYLE = { height: 480 };

function RecentRequests({ requests = [] }) {
 return (
 <Card className="flex min-w-0 flex-col overflow-hidden" padding="sm" style={RECENT_REQUESTS_CARD_STYLE}>
 {/* Header */}
 <div className="px-1 h-8 border-b border-border shrink-0">
 <span className="text-xs font-medium text-text-muted">Recent Requests</span>
 </div>

 {!requests.length ? (
 <div className="flex-1 flex items-center justify-center text-text-muted text-sm">No requests yet.</div>
 ) : (
 <div className="flex-1 overflow-y-auto">
 <table className="data-table data-table-plain w-full min-w-[300px] text-xs" aria-label="Recent requests">
 <thead className="sticky top-0 z-10">
 <tr>
 <th scope="col" className="py-2 text-left text-text-muted w-2 h-8 text-xs font-medium"></th>
 <th scope="col" className="py-2 text-left text-text-muted h-8 text-xs font-medium">Model</th>
 <th scope="col" className="py-2 text-right text-text-muted whitespace-nowrap h-8 text-xs font-medium">In / Out</th>
 <th scope="col" className="py-2 text-right text-text-muted h-8 text-xs font-medium">When</th>
 </tr>
 </thead>
 <tbody>
 {requests.map((r, i) => {
 const ok = !r.status || r.status === "ok" || r.status === "success";
 return (
 <tr key={i} className={` ${!ok ? "row-failed" : ""}`}>
 <td className="py-2 h-8 px-3 text-sm">
 <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-danger"}`} />
 </td>
 <td className="py-2 font-mono truncate max-w-[120px] h-8 px-3 text-sm" title={r.model}>{r.model}</td>
 <td className="py-2 text-right whitespace-nowrap h-8 px-3 text-sm">
 <span className="text-primary">{fmt(r.promptTokens)}↑</span>
 {" "}
 <span className="text-success">{fmt(r.completionTokens)}↓</span>
 </td>
 <td className="py-2 text-right text-text-muted whitespace-nowrap h-8 px-3 text-sm"><TimeAgo timestamp={r.timestamp} /></td>
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

function RequestStream({ buckets = [] }) {
 const total = buckets.reduce((sum, bucket) => sum + Number(bucket.requests || 0), 0);
 const current = buckets.length ? Number(buckets[buckets.length - 1]?.requests || 0) : 0;
 const max = Math.max(1, ...buckets.map((bucket) => Number(bucket.requests || 0)));

 return (
 <Card className="min-w-0 overflow-hidden" padding="sm">
 <div className="flex items-center justify-between border-b border-border px-1 h-8">
 <span className="text-xs font-medium text-text-muted">Request Stream</span>
 <span className="text-sm font-semibold text-primary" title={`Total last 10m: ${total.toLocaleString("en-US")} requests`}>
 {current.toLocaleString("en-US")} requests / 1 min
 </span>
 </div>
 {!buckets.length ? (
 <div className="flex h-32 items-center justify-center text-sm text-text-muted">No requests yet.</div>
 ) : (
 <div className="flex h-32 items-end gap-1 px-1 py-3" aria-label="Requests per minute for last 10 minutes">
 {buckets.map((bucket, index) => {
 const requests = Number(bucket.requests || 0);
 const height = requests > 0 ? Math.max(8, Math.round((requests / max) * 100)) : 2;
 const timeLabel = bucket.timestamp
 ? new Date(bucket.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
 : "";
 return (
 <div key={`${bucket.timestamp || index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={timeLabel ? `${timeLabel}: ${requests} requests` : `${requests} requests`}>
 <span className="text-[11px] text-text-muted">{requests || ""}</span>
 <div className="w-full rounded-t bg-primary/70" style={{ height: `${height}%` }} />
 </div>
 );
 })}
 </div>
 )}
 </Card>
 );
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
 return Object.entries(dataMap || {})
 .map(([key, data]) => {
 const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
 const totalCost = data.cost || 0;
 // ponytail: cost split is a token-share allocation of the (rate-accurate)
 // server total, not a per-rate recompute. cached is a subset of prompt, so
 // peel it out of the input share. Upgrade to a stored per-component cost
 // breakdown if exact cached-rate cost display is needed.
 const cachedTokens = data.cachedTokens || 0;
 const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
 const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
 const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
 const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
 return { ...data, key, totalTokens, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
 })
 .sort((a, b) => {
 let valA = a[sortBy];
 let valB = b[sortBy];
 if (typeof valA === "string") valA = valA.toLowerCase();
 if (typeof valB === "string") valB = valB.toLowerCase();
 if (valA < valB) return sortOrder === "asc" ? -1 : 1;
 if (valA > valB) return sortOrder === "asc" ? 1 : -1;
 return 0;
 });
}

function getGroupKey(item, keyField) {
 switch (keyField) {
 case "rawModel": return item.rawModel || "Unknown Model";
 case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
 case "keyName": return item.keyName || "Unknown Key";
 case "endpoint": return item.endpoint || "Unknown Endpoint";
 default: return item[keyField] || "Unknown";
 }
}

function groupDataByKey(data, keyField) {
 if (!Array.isArray(data)) return [];
 const groups = {};
 data.forEach((item) => {
 const gk = getGroupKey(item, keyField);
 if (!groups[gk]) {
 groups[gk] = {
 groupKey: gk,
 summary: { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, lastUsed: null, pending: 0 },
 items: [],
 };
 }
 const s = groups[gk].summary;
 s.requests += item.requests || 0;
 s.promptTokens += item.promptTokens || 0;
 s.completionTokens += item.completionTokens || 0;
 s.cachedTokens += item.cachedTokens || 0;
 s.totalTokens += item.totalTokens || 0;
 s.cost += item.cost || 0;
 s.inputCost += item.inputCost || 0;
 s.cachedCost += item.cachedCost || 0;
 s.outputCost += item.outputCost || 0;
 s.pending += item.pending || 0;
 if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
 s.lastUsed = item.lastUsed;
 }
 groups[gk].items.push(item);
 });
 return Object.values(groups);
}

const MODEL_COLUMNS = [
 { field: "rawModel", label: "Model" },
 { field: "provider", label: "Provider" },
 { field: "requests", label: "Requests", align: "right" },
 { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
 { field: "rawModel", label: "Model" },
 { field: "provider", label: "Provider" },
 { field: "accountName", label: "Account" },
 { field: "requests", label: "Requests", align: "right" },
 { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
 { field: "keyName", label: "API Key Name" },
 { field: "rawModel", label: "Model" },
 { field: "provider", label: "Provider" },
 { field: "requests", label: "Requests", align: "right" },
 { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
 { field: "endpoint", label: "Endpoint" },
 { field: "rawModel", label: "Model" },
 { field: "provider", label: "Provider" },
 { field: "requests", label: "Requests", align: "right" },
 { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
 { value: "model", label: "Usage by Model" },
 { value: "account", label: "Usage by Account" },
 { value: "apiKey", label: "Usage by API Key" },
 { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
 { value: "today", label: "Today" },
 { value: "24h", label: "24h" },
 { value: "7d", label: "7D" },
 { value: "30d", label: "30D" },
 { value: "60d", label: "60D" },
];

export default function UsageStats({
 period: periodProp,
 setPeriod: setPeriodProp,
 hidePeriodSelector = false,
 subtab: subtabProp,
 onSubtabChange,
} = {}) {
 const router = useRouter();
 const searchParams = useSearchParams();

 const sortBy = searchParams.get("sortBy") || "rawModel";
 const sortOrder = searchParams.get("sortOrder") || "asc";
 const subTabFromUrl = searchParams.get("subtab");

 const activeSubTab =
 subtabProp ?? resolveActiveSubTab(subTabFromUrl, "overview");

 const [stats, setStats] = useState(null);
 const [loading, setLoading] = useState(true);
 const [fetching, setFetching] = useState(false);
 const [statsError, setStatsError] = useState(null);
 const [tableView, setTableView] = useState("model");
 const [viewMode, setViewMode] = useState("costs");
 const [providers, setProviders] = useState([]);
 const [periodLocal, setPeriodLocal] = useState("today");
 const isInitialLoad = useRef(true);
 const hasLoadedStats = useRef(false);
 const providersLoaded = useRef(false);
 const statsAbortRef = useRef(null);
 const providersAbortRef = useRef(null);
 const period = periodProp ?? periodLocal;
 const setPeriod = setPeriodProp ?? setPeriodLocal;

 const handleSubTabChange = (value) => {
 if (value === activeSubTab) return;
 if (onSubtabChange) onSubtabChange(value);
 const params = new URLSearchParams(searchParams.toString());
 params.set("subtab", value);
 router.replace(`?${params.toString()}`, { scroll: false });
 };

 // Fetch connected providers lazily only when Overview sub-tab is active (topology inside)
 // Always include noAuth free providers (e.g. opencode) regardless of connections
 useEffect(() => {
 if (activeSubTab !== "overview" || providersLoaded.current) return;
 providersLoaded.current = true;

 // Abort any in-flight provider fetch (switching sub-tabs rapidly)
 providersAbortRef.current?.abort();
 const ctrl = new AbortController();
 providersAbortRef.current = ctrl;

 Promise.all([
 fetch("/api/providers?isActive=true&distinct=provider&fields=summary", { signal: ctrl.signal }).then((r) => r.ok ? r.json() : null),
 fetch("/api/provider-nodes", { signal: ctrl.signal }).then((r) => r.ok ? r.json() : null),
 ])
 .then(([d, nodesData]) => {
 // Build node name lookup for custom providers
 const nodeNameMap = {};
 for (const node of (nodesData?.nodes || [])) {
 nodeNameMap[node.id] = node.name;
 }
 setProviders(buildUsageProviderList({
 connections: d?.connections || [],
 freeProviders: FREE_PROVIDERS,
 nodeNameMap,
 isLLMProvider,
 }));
 })
 .catch((err) => {
 // Swallow abort errors from rapid tab switches; log real failures only
 if (err?.name !== "AbortError") console.warn("[UsageStats] provider fetch failed:", err);
 });

 return () => ctrl.abort();
 }, [activeSubTab]);

 // Fetch filtered stats via REST when period changes
 const fetchStats = useCallback(() => {
 // Abort prior in-flight stats fetch so period switches never race
 statsAbortRef.current?.abort();
 const ctrl = new AbortController();
 statsAbortRef.current = ctrl;

 // First load: show full spinner; subsequent: show subtle fetching indicator
 if (isInitialLoad.current) {
 isInitialLoad.current = false;
 setLoading(true);
 } else {
 setFetching(true);
 }
 setStatsError(null);

 fetch(`/api/usage/stats?period=${period}`, { signal: ctrl.signal })
 .then((r) => {
 if (!r.ok) {
 throw new Error(`Failed to load usage statistics (${r.status})`);
 }
 return r.json();
 })
 .then((data) => {
 if (ctrl.signal.aborted) return;
 if (data) {
 hasLoadedStats.current = true;
 setStats((prev) => ({ ...prev, ...data }));
 setStatsError(null);
 }
 })
 .catch((err) => {
 if (err.name === "AbortError" || ctrl.signal.aborted) return;
 console.error("Failed to fetch usage stats:", err);
 setStatsError(err.message || "Failed to load usage statistics");
 })
 .finally(() => {
 if (!ctrl.signal.aborted) {
 setLoading(false);
 setFetching(false);
 }
 });
 }, [period]);

 useEffect(() => {
 // Defers setState off the effect's synchronous body (react-hooks/set-state-in-effect)
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) fetchStats();
 });
 return () => {
 cancelled = true;
 statsAbortRef.current?.abort();
 };
 }, [fetchStats]);

 // SSE connection - real-time updates for activeRequests + recentRequests only
 // Exponential backoff reconnect: 1s → 2s → 4s → ... → 30s cap
 // Pauses when document is hidden to avoid wasted reconnect cycles
 useEffect(() => {
 const MAX_BACKOFF_MS = 30000;
 let es = null;
 let attempt = 0;
 let retryTimer = null;

 function connect() {
 es = new EventSource("/api/usage/stream");

 es.onmessage = (e) => {
 try {
 const data = JSON.parse(e.data);
 // Always merge only real-time fields, never overwrite full stats from REST
 setStats((prev) => {
 if (!prev) return prev;
 return {
 ...prev,
 activeRequests: data.activeRequests,
 recentRequests: data.recentRequests,
 errorProvider: data.errorProvider,
 pending: data.pending,
 last10Minutes: data.last10Minutes,
 };
 });
 if (hasLoadedStats.current) setLoading(false);
 } catch (err) {
 console.error("[SSE CLIENT] parse error:", err);
 }
 };

 es.onerror = () => {
 if (document.hidden) return; // pause while hidden
 setLoading(false);
 es.close();
 const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
 attempt += 1;
 retryTimer = setTimeout(connect, delay);
 };

 es.onopen = () => {
 attempt = 0; // reset backoff on successful open
 };
 }

 connect();

 const onVisibility = () => {
 if (!document.hidden && es?.readyState === EventSource.CLOSED) {
 attempt = 0;
 connect();
 }
 };
 document.addEventListener("visibilitychange", onVisibility);

 return () => {
 clearTimeout(retryTimer);
 document.removeEventListener("visibilitychange", onVisibility);
 es?.close();
 };
 }, []);

 const toggleSort = useCallback((tableType, field) => {
 const params = new URLSearchParams(searchParams.toString());
 if (params.get("sortBy") === field) {
 params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
 } else {
 params.set("sortBy", field);
 params.set("sortOrder", "asc");
 }
 router.replace(`?${params.toString()}`, { scroll: false });
 }, [searchParams, router]);

 // Compute active table data
 const activeTableConfig = useMemo(() => {
 if (!stats) return null;
 switch (tableView) {
 case "model": {
 const pendingMap = stats.pending?.byModel || {};
 return {
 columns: MODEL_COLUMNS,
 groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
 storageKey: "usage-stats:expanded-models",
 emptyMessage: "No usage recorded yet.",
 renderSummaryCells: (group) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(group.summary.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(group.summary.lastUsed)}</td>
 </>
 ),
 renderDetailCells: (item) => (
 <>
 <td className={`h-8 px-3 text-sm text-text-main px-3 sm:px-3 h-8 sm:py-3 font-medium ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(item.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(item.lastUsed)}</td>
 </>
 ),
 };
 }
 case "account": {
 const pendingMap = {};
 if (stats?.pending?.byAccount) {
 Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
 const connPending = stats.pending.byAccount[data.connectionId];
 if (connPending) {
 const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
 pendingMap[accountKey] = connPending[modelKey] || 0;
 }
 });
 }
 return {
 columns: ACCOUNT_COLUMNS,
 groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
 storageKey: "usage-stats:expanded-accounts",
 emptyMessage: "No account-specific usage recorded yet.",
 renderSummaryCells: (group) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(group.summary.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(group.summary.lastUsed)}</td>
 </>
 ),
 renderDetailCells: (item) => (
 <>
 <td className={`h-8 px-3 text-sm text-text-main px-3 sm:px-3 h-8 sm:py-3 font-medium ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
 <td className={`h-8 px-3 text-sm text-text-main px-3 sm:px-3 h-8 sm:py-3 font-medium ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(item.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(item.lastUsed)}</td>
 </>
 ),
 };
 }
 case "apiKey": {
 return {
 columns: API_KEY_COLUMNS,
 groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
 storageKey: "usage-stats:expanded-apikeys",
 emptyMessage: "No API key usage recorded yet.",
 renderSummaryCells: (group) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(group.summary.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(group.summary.lastUsed)}</td>
 </>
 ),
 renderDetailCells: (item) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 font-medium text-sm">{item.keyName}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm">{item.rawModel}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(item.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(item.lastUsed)}</td>
 </>
 ),
 };
 }
 case "endpoint":
 default: {
 return {
 columns: ENDPOINT_COLUMNS,
 groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
 storageKey: "usage-stats:expanded-endpoints",
 emptyMessage: "No endpoint usage recorded yet.",
 renderSummaryCells: (group) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-text-muted text-sm">—</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(group.summary.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(group.summary.lastUsed)}</td>
 </>
 ),
 renderDetailCells: (item) => (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 font-medium font-mono text-sm">{item.endpoint}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm">{item.rawModel}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-sm"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-sm">{fmt(item.requests)}</td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted whitespace-nowrap text-sm">{fmtTime(item.lastUsed)}</td>
 </>
 ),
 };
 }
 }
 }, [stats, tableView, sortBy, sortOrder]);

 if (!stats && !loading) {
 return (
 <div role="alert" className="flex flex-col items-center justify-center p-3 gap-3 border border-danger/30 bg-danger/10 text-danger rounded-sm text-sm">
 <span>{statsError || "Failed to load usage statistics."}</span>
 <button
 type="button"
 onClick={fetchStats}
 className="px-3 py-2 rounded-sm text-xs font-medium border border-danger/30 bg-danger/10 hover:bg-danger/10"
 >
 Retry
 </button>
 </div>
 );
 }

 const spinner = (
 <div
 role="status"
 aria-live="polite"
 className="flex items-center justify-center py-3 text-text-muted"
 >
 <span className="sr-only">Loading usage statistics</span>
 <span
 aria-hidden="true"
 className="material-symbols-outlined text-[32px] animate-spin"
 >
 progress_activity
 </span>
 </div>
 );

 return (
 <div className="flex min-w-0 flex-col gap-3">
 {/* Period failure error banner */}
 {statsError && (
 <div role="alert" className="flex items-center justify-between p-3 rounded-sm border border-danger/30 bg-danger/10 text-danger text-xs">
 <span>{statsError}</span>
 <button
 type="button"
 onClick={fetchStats}
 className="px-2.5 py-1 rounded-sm text-xs font-medium border border-danger/30 bg-danger/10 hover:bg-danger/10"
 >
 Retry
 </button>
 </div>
 )}
 {/* Period selector (hidden when controlled by parent); pinned right end */}
 {!hidePeriodSelector && (
 <div className="flex w-full items-center justify-end gap-2">
 <div className="flex flex-1 flex-wrap items-center justify-end gap-1 rounded-sm border border-border bg-surface-2 sm:flex-none">
 {PERIODS.map((p) => (
 <button
 key={p.value}
 onClick={() => setPeriod(p.value)}
 disabled={fetching}
 aria-pressed={period === p.value}
 className={`rounded-sm px-3 py-1 text-sm font-medium ${period === p.value ? "bg-primary text-white " : "text-text-muted hover:bg-surface-2 hover:text-text"}`}
 >
 {p.label}
 </button>
 ))}
 </div>
 {fetching && (
 <span role="status" aria-label="Refreshing usage data">
 <span
 aria-hidden="true"
 className="material-symbols-outlined text-[18px] text-text-muted animate-spin"
 >
 progress_activity
 </span>
 </span>
 )}
 </div>
 )}

 {/* Overview cards */}
 {loading ? spinner : <OverviewCards stats={stats} />}

 {/* Overview sub-tabs */}
 <div className="flex flex-col gap-3">
 <div className="overflow-x-auto no-scrollbar tab-scroll-fade pb-0.5 sm:pb-0">
 <SegmentedControl
 options={OVERVIEW_SUBTABS}
 value={activeSubTab}
 onChange={handleSubTabChange}
 className="w-full sm:w-auto min-w-max"
 />
 </div>

 {/* Sub-tab content */}
 {loading ? (
 spinner
 ) : (
 <>
 {activeSubTab === "breakdown" && (
 <div className="flex flex-col gap-3">
 <UsageChart period={period} />
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
 <select
 value={tableView}
 onChange={(e) => setTableView(e.target.value)}
 aria-label="Usage table dimension"
 className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm font-medium text-text-main focus:outline-none sm:w-auto"
 >
 {TABLE_OPTIONS.map((opt) => (
 <option key={opt.value} value={opt.value}>
 {opt.label}
 </option>
 ))}
 </select>
 <div className="grid grid-cols-2 items-center gap-1 rounded-sm border border-border bg-surface-2 sm:flex">
 <button
 onClick={() => setViewMode("costs")}
 aria-pressed={viewMode === "costs"}
 className={`px-3 py-1 rounded-sm text-sm font-medium ${
 viewMode === "costs"
 ? "bg-primary text-white "
 : "text-text-muted hover:text-text hover:bg-surface-2"
 }`}
 >
 Costs
 </button>
 <button
 onClick={() => setViewMode("tokens")}
 aria-pressed={viewMode === "tokens"}
 className={`px-3 py-1 rounded-sm text-sm font-medium ${
 viewMode === "tokens"
 ? "bg-primary text-white "
 : "text-text-muted hover:text-text hover:bg-surface-2"
 }`}
 >
 Tokens
 </button>
 </div>
 </div>
 {activeTableConfig && (
 <UsageTable
 title=""
 columns={activeTableConfig.columns}
 groupedData={activeTableConfig.groupedData}
 tableType={tableView}
 sortBy={sortBy}
 sortOrder={sortOrder}
 onToggleSort={toggleSort}
 viewMode={viewMode}
 storageKey={activeTableConfig.storageKey}
 renderSummaryCells={activeTableConfig.renderSummaryCells}
 renderDetailCells={activeTableConfig.renderDetailCells}
 emptyMessage={activeTableConfig.emptyMessage}
 />
 )}
 </div>
 </div>
 )}

 {activeSubTab !== "breakdown" && (
 <div className="flex flex-col gap-3">
 <div className="grid min-w-0 grid-cols-1 items-stretch gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
 <ProviderTopology
 providers={providers}
 activeRequests={stats?.activeRequests || []}
 lastProvider={stats?.recentRequests?.[0]?.provider || ""}
 errorProvider={stats?.errorProvider || ""}
 />
 <RecentRequests requests={stats?.recentRequests || []} />
 </div>
 <RealtimeRequestsCard
 activeRequests={stats?.activeRequests || []}
 recentRequests={stats?.recentRequests || []}
 />
 <RequestStream buckets={stats?.last10Minutes || []} />
 </div>
 )}
 </>
 )}
 </div>
 </div>
 );
}
