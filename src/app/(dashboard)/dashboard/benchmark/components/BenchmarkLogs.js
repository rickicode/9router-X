"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/shared/components";

export default function BenchmarkLogs({ open, onClose, attempts, isJobRunning, active, onRefresh, onInspect }) {
  // State: Live Logs modal (request + AI response saat benchmark berjalan)
  const [logSearch, setLogSearch] = useState("");
  const [logSuiteFilter, setLogSuiteFilter] = useState("all");
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [logExpandedId, setLogExpandedId] = useState(null);
  const logScrollRef = useRef(null);

  // Live log tail: semua request + respons AI, kronologis (lama → baru)
  const logEntries = useMemo(() => {
    const q = logSearch.toLowerCase().trim();
    return [...attempts]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .filter((row) => {
        if (logSuiteFilter !== "all" && row.suite !== logSuiteFilter) return false;
        if (!q) return true;
        return (
          row.model?.toLowerCase().includes(q) ||
          row.account_name?.toLowerCase().includes(q) ||
          row.provider?.toLowerCase().includes(q) ||
          (row.request_body || "").toLowerCase().includes(q) ||
          (row.response_body || row.excerpt || "").toLowerCase().includes(q) ||
          (row.error || "").toLowerCase().includes(q)
        );
      });
  }, [attempts, logSearch, logSuiteFilter]);

  // Pretty-print JSON request body (outside render loop)
  function prettyJSON(str) {
    try { return JSON.stringify(JSON.parse(str || "null"), null, 2); }
    catch { return str || "-"; }
  }

  // Auto-scroll tail ke bawah saat attempt baru masuk
  useEffect(() => {
    if (open && logAutoScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logEntries.length, open, logAutoScroll]);

  // ESC key close log modal
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
        role="dialog"
        aria-labelledby="log-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
          <div>
            <h3 id="log-modal-title" className="font-bold text-text-main text-base flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-500">terminal</span>
              <span>Live Logs — Request & Respons AI</span>
              {isJobRunning ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 text-[10px] font-bold animate-pulse">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {logEntries.length} dari {attempts.length} log · {active?.progress?.phase || active?.status || "-"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-xl leading-none">close</span>
          </button>
        </div>

        {/* Filter bar: search + suite + auto-scroll */}
        <div className="px-6 py-3 border-b border-border bg-white dark:bg-[#202020] flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Cari model, akun, isi request / respons..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {["all", "pong", "coding", "logic", "tool"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLogSuiteFilter(s)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors uppercase ${
                  logSuiteFilter === s
                    ? "bg-brand-500 text-white shadow-xs"
                    : "bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-main"
                }`}
              >
                {s === "all" ? "Semua" : s}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none ml-auto">
            <input
              type="checkbox"
              checked={logAutoScroll}
              onChange={(e) => setLogAutoScroll(e.target.checked)}
              className="rounded border-border text-brand-500 focus:ring-brand-500"
            />
            Auto-scroll
          </label>
        </div>

        {/* Log tail body */}
        <div ref={logScrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 bg-[#faf7f2] dark:bg-[#1a1a1a] font-mono text-[11px]">
          {logEntries.map((row) => {
            const id = row.id || `${row.model}-${row.suite}-${row.rep}-${row.created_at}`;
            const expanded = logExpandedId === id;
            const reqText = expanded ? prettyJSON(row.request_body) : "";
            const respText = row.response_body || row.excerpt || row.error || "-";
            const statusColor =
              row.status === "passed"
                ? "border-emerald-500/30 text-emerald-500 dark:text-emerald-400"
                : row.status === "rate_limited"
                ? "border-amber-500/30 text-amber-500 dark:text-amber-400"
                : row.status === "skipped"
                ? "border-slate-500/30 text-slate-400"
                : "border-rose-500/30 text-rose-500 dark:text-rose-400";
            return (
              <div key={id} className="rounded-xl border border-border bg-white dark:bg-[#242424] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLogExpandedId(expanded ? null : id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2/60 transition-colors"
                >
                  <span className="text-text-muted text-xs w-16 shrink-0">
                    {row.created_at ? new Date(row.created_at).toLocaleTimeString() : "-"}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase shrink-0 ${statusColor}`}>
                    {row.http_status || row.status}
                  </span>
                  <span className="font-bold text-text-main truncate flex-1 text-[11px]">{row.model}</span>
                  <span className="text-text-muted uppercase text-[10px] shrink-0">{row.suite} r{row.rep || 1}</span>
                  <span className="text-text-muted truncate max-w-[140px] hidden sm:inline">{row.account_name || ""}</span>
                  <span className="material-symbols-outlined text-sm text-text-muted transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                    expand_more
                  </span>
                </button>
                <div className="px-3 pb-2 text-text-muted truncate text-[10px]">
                  <span className="text-emerald-500 dark:text-emerald-400 font-bold">RESP:</span> {(row.response_body || row.excerpt || row.error || "-").slice(0, 160)}
                </div>
                {expanded ? (
                  <div className="border-t border-border px-3 py-2 space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-text-muted font-bold text-[10px]">REQUEST:</span>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.request_body || ""); }} className="text-brand-500 hover:underline text-[10px]">
                          Salin
                        </button>
                      </div>
                      <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-2.5 text-text-main whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{reqText}</pre>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-text-muted font-bold text-[10px]">RESPONSE AI:</span>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(respText); }} className="text-brand-500 hover:underline text-[10px]">
                          Salin
                        </button>
                      </div>
                      <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-2.5 text-text-main whitespace-pre-wrap break-all max-h-[32rem] overflow-y-auto">{respText}</pre>
                    </div>
                    {row.error ? (
                      <pre className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-rose-600 dark:text-rose-300 whitespace-pre-wrap break-all">{row.error}</pre>
                    ) : null}
                    <div className="flex flex-wrap gap-2 text-[10px] text-text-muted">
                      <span>TTFT: {row.ttft_ms ? `${row.ttft_ms}ms` : "-"}</span>
                      <span>Total: {row.total_ms ? `${row.total_ms}ms` : "-"}</span>
                      <span>Tokens: {row.tokens ?? "-"}</span>
                      <span>Score: {row.score ?? "-"}</span>
                      <button onClick={(e) => { e.stopPropagation(); onInspect(row); }} className="text-brand-500 hover:underline">
                        Buka di Inspector →
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {logEntries.length === 0 ? (
            <div className="py-10 text-center text-text-muted font-sans text-xs">
              {isJobRunning ? "Menunggu attempt pertama masuk..." : "Tidak ada log yang cocok dengan filter."}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3 bg-[#fbf9f6] dark:bg-[#282828]">
          <span className="text-[11px] text-text-muted">
            Auto-refresh tiap {isJobRunning ? "3" : "8"} detik · scroll otomatis: {logAutoScroll ? "aktif" : "mati"}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onRefresh} icon="refresh">
              Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;
}