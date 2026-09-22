"use client";

import { useState, useMemo, useEffect } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import { cn } from "@/shared/utils/cn";
import RealtimeRequestRow, { RealtimeRequestCardMobile } from "./realtime/RealtimeRequestRow";
import ActiveRequestsModal from "./realtime/ActiveRequestsModal";
import RequestErrorModal from "./realtime/RequestErrorModal";

export default function RealtimeRequestsCard({
 activeRequests = [],
 recentRequests = [],
 className,
}) {
 const [filterType, setFilterType] = useState("all");
 const [search, setSearch] = useState("");
 const [selectedError, setSelectedError] = useState(null);
 const [errorDetailsLoading, setErrorDetailsLoading] = useState(false);
 const [fetchedError, setFetchedError] = useState(null);
 const [showActiveModal, setShowActiveModal] = useState(false);

 const handleOpenErrorModal = (req) => {
 setSelectedError(req);
 setFetchedError(req?.error || null);
 setErrorDetailsLoading(!req?.error);
 };

 const handleCloseErrorModal = () => {
 setSelectedError(null);
 setFetchedError(null);
 setErrorDetailsLoading(false);
 };

 useEffect(() => {
 if (!selectedError) {
 setErrorDetailsLoading(false);
 return;
 }
 if (selectedError.error) {
 setErrorDetailsLoading(false);
 return;
 }
 let active = true;
 setErrorDetailsLoading(true);
 const modelParam = encodeURIComponent(selectedError.model || "");
 const providerParam = encodeURIComponent(selectedError.provider || "");
 fetch(`/api/usage/request-details?model=${modelParam}&provider=${providerParam}&pageSize=5`)
 .then((res) => {
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 return res.json();
 })
 .then((data) => {
 if (!active) return;
 const match = (data.details || []).find(
 (d) => d.status !== "success" || d.error || d.response?.error
 );
 if (match) {
 setFetchedError(match.error || match.response?.error || match.response || null);
 if (match.account || match.connectionId) {
 setSelectedError((prev) => (prev ? {
 ...prev,
 account: prev.account && prev.account !== "Direct" ? prev.account : (match.account || match.connectionId)
 } : prev));
 }
 } else {
 setFetchedError({ message: "No error details available for this request" });
 }
 })
 .catch((err) => {
 if (active) {
 console.error("Failed to fetch request error details:", err);
 setFetchedError({ message: err.message || "Failed to load error details" });
 }
 })
 .finally(() => {
 if (active) setErrorDetailsLoading(false);
 });
 return () => {
 active = false;
 };
 }, [selectedError]);

 const filteredRecents = useMemo(() => {
 return recentRequests.filter((r) => {
 const isOk = !r.status || r.status === "ok" || r.status === "success";
 if (filterType === "streaming" && !r.isStream) return false;
 if (filterType === "json" && r.isStream) return false;
 if (filterType === "success" && !isOk) return false;
 if (filterType === "failed" && isOk) return false;

 if (search.trim()) {
 const q = search.toLowerCase();
 const m = (r.model || "").toLowerCase();
 const p = (r.provider || "").toLowerCase();
 const k = (r.apiKey || "").toLowerCase();
 if (!m.includes(q) && !p.includes(q) && !k.includes(q)) return false;
 }
 return true;
 });
 }, [recentRequests, filterType, search]);

 const streamCount = useMemo(
 () => recentRequests.filter((r) => r.isStream).length,
 [recentRequests],
 );
 const jsonCount = useMemo(
 () => recentRequests.filter((r) => !r.isStream).length,
 [recentRequests],
 );

 const filterPills = useMemo(() => [
 { id: "all", label: "All", count: recentRequests.length },
 { id: "streaming", label: "Stream", count: streamCount },
 { id: "json", label: "JSON", count: jsonCount },
 { id: "success", label: "Success", count: recentRequests.filter((r) => !r.status || r.status === "ok" || r.status === "success").length },
 { id: "failed", label: "Failed", count: recentRequests.filter((r) => r.status && r.status !== "ok" && r.status !== "success").length },
 ], [recentRequests, streamCount, jsonCount]);

 return (
 <Card
 title="Realtime Request Stream & Live Activity"
 subtitle="Live request stream with status (streaming / completed), format (Stream / JSON), model, provider, and API key"
 icon="stream"
 padding="md"
 className={cn("flex min-w-0 flex-col gap-3 overflow-hidden", className)}
 action={
 <div className="flex items-center gap-2">
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-success opacity-75"></span>
 <span className="relative inline-flex rounded-sm h-2 w-2 bg-success"></span>
 </span>
 <span className="text-xs font-medium text-success font-mono">
 Live Stream
 </span>
 </div>
 }
 >
 {/* Active In-Flight Requests — summary only, details via modal */}
 {activeRequests.length > 0 && (
 <div className="flex flex-col gap-2 rounded-sm bg-primary/10 border border-primary/30 p-3">
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <span className="relative flex h-2.5 w-2.5">
 <span className="absolute inline-flex h-full w-full rounded-sm animate-ping bg-primary opacity-75"></span>
 <span className="relative inline-flex rounded-sm h-2.5 w-2.5 bg-primary"></span>
 </span>
 <span className="text-xs font-medium text-primary">
 Streaming ({activeRequests.length} active)
 </span>
 </div>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowActiveModal(true)}
 className="!h-8 !px-2 !text-xs font-medium inline-flex items-center gap-1"
 >
 <span className="material-symbols-outlined !text-[18px]">
 visibility
 </span>
 View Details
 </Button>
 </div>
 <span className="text-[11px] text-text-muted">
 Click View Details to inspect active in-flight requests. Closing the modal stops live polling.
 </span>
 </div>
 )}

 {/* In-Flight Detail Modal */}
 <ActiveRequestsModal
 isOpen={showActiveModal}
 onClose={() => setShowActiveModal(false)}
 activeRequests={activeRequests}
 />

 {/* Control Bar: Filter Pills & Search */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 min-w-0 max-w-full">
 <div className="w-full sm:w-auto min-w-0 overflow-x-auto no-scrollbar py-1">
 <div className="flex items-center gap-1.5 min-w-max">
 {filterPills.map((pill) => (
 <button
 key={pill.id}
 type="button"
 onClick={() => setFilterType(pill.id)}
 className={cn(
 "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium cursor-pointer select-none shrink-0",
 filterType === pill.id
 ? "bg-surface-3 border border-border text-text-main font-semibold"
 : "bg-surface border border-border text-text-muted hover:text-text-main hover:bg-surface-2",
 )}
 >
 <span>{pill.label}</span>
 <span className="text-[11px] opacity-70 font-mono">
 ({pill.count})
 </span>
 </button>
 ))}
 </div>
 </div>

 <div className="w-full sm:w-64 min-w-0">
 <Input
 aria-label="Filter realtime requests"
 placeholder="Search model, provider, apikey..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-full text-xs h-8"
 />
 </div>
 </div>

 {/* Full-width Request Stream Table */}
 {!filteredRecents.length ? (
 <div className="flex h-36 items-center justify-center rounded-sm border border-dashed border-border text-xs text-text-muted">
 {recentRequests.length === 0
 ? "Waiting for incoming requests... SSE live listener active."
 : "No requests match the selected filter."}
 </div>
 ) : (
 <div className="rounded-sm border border-border bg-surface/50 overflow-hidden">
 {/* Mobile Card List (< sm) */}
 <div className="sm:hidden data-cards">
 {filteredRecents.map((r, i) => (
 <RealtimeRequestCardMobile key={`mob-${i}`} req={r} onOpenError={handleOpenErrorModal} />
 ))}
 </div>

 {/* Desktop Table (sm+) */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="data-table w-full min-w-[860px] text-left text-xs" aria-label="Recent requests stream">
 <thead>
 <tr className="text-text-muted font-medium text-[11px]">
 <th scope="col" className="h-8 px-3 w-8 text-center text-xs font-medium text-text-muted">Status</th>
 <th scope="col" className="h-8 px-3 w-24 text-xs font-medium text-text-muted">Type</th>
 <th scope="col" className="h-8 px-3 w-28 text-xs font-medium text-text-muted">Stream State</th>
 <th scope="col" className="h-8 px-3 text-xs font-medium text-text-muted">Model</th>
 <th scope="col" className="h-8 px-3 w-28 text-xs font-medium text-text-muted">Provider</th>
 <th scope="col" className="h-8 px-3 w-44 text-xs font-medium text-text-muted">Upstream Account</th>
 <th scope="col" className="h-8 px-3 w-36 text-xs font-medium text-text-muted">Client API Key</th>
 <th scope="col" className="h-8 px-3 text-right w-28 whitespace-nowrap text-xs font-medium text-text-muted">
 Tokens In/Out
 </th>
 <th scope="col" className="h-8 px-3 text-right w-24 whitespace-nowrap text-xs font-medium text-text-muted">
 When
 </th>
 <th scope="col" className="h-8 px-3 text-center w-28 whitespace-nowrap text-xs font-medium text-text-muted">
 Action
 </th>
 </tr>
 </thead>
 <tbody>
 {filteredRecents.map((r, i) => (
 <RealtimeRequestRow key={i} req={r} onOpenError={handleOpenErrorModal} />
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Error Details Modal */}
 <RequestErrorModal
 selectedError={selectedError}
 fetchedError={fetchedError}
 loading={errorDetailsLoading}
 onClose={handleCloseErrorModal}
 />
 </Card>
 );
}
