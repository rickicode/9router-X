"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "./Card";
import Button from "./Button";
import Modal from "./Modal";

const LOGS_POLL_MS = 3000;

/**
 * Normalize a log entry into a structured object.
 * Handles both JSON objects (new format from API) and pipe-delimited
 * strings (legacy format from older API responses).
 */
function parseLogEntry(entry) {
  if (entry && typeof entry === "object") return entry;
  if (typeof entry === "string") {
    const parts = entry.split(" | ");
    if (parts.length >= 7) {
      return {
        datetime: parts[0] || "-",
        model: parts[1] || "-",
        provider: parts[2] || "-",
        account: parts[3] || "-",
        sent: parts[4] || "-",
        received: parts[5] || "-",
        status: parts[6] || "-",
      };
    }
  }
  return null;
}

export default function RequestLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const abortRef = useRef(null);

  const fetchLogs = useCallback(async (showLoading = true) => {
    // Abort any in-flight poll so stale responses never overwrite newer data
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (showLoading) setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/usage/request-logs", { signal: ctrl.signal });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Failed to load logs (${res.status})`);
      }
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      // Normalize: accept array of objects or legacy pipe-delimited strings
      const normalized = Array.isArray(data)
        ? data.map(parseLogEntry).filter(Boolean)
        : [];
      setLogs(normalized);
    } catch (error) {
      if (error.name === "AbortError" || ctrl.signal.aborted) return;
      setFetchError(error.message || "Failed to fetch logs");
    } finally {
      if (showLoading && !ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    return () => abortRef.current?.abort();
  }, [fetchLogs]);

  // Auto-refresh: paused while the tab is hidden (background polls waste CPU +
  // DB); resumes with an immediate catch-up fetch when the tab becomes visible.
  useEffect(() => {
    if (!autoRefresh) return;
    let timer = null;
    const start = () => {
      if (!timer) timer = setInterval(() => {
        if (!document.hidden) fetchLogs(false);
      }, LOGS_POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { start(); fetchLogs(false); }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoRefresh, fetchLogs]);

  const handleOpenDetail = (log) => {
    // `log` is already a structured object from parseLogEntry
    setSelectedLog({
      raw: log.raw || `${log.datetime} | ${log.model} | ${log.provider} | ${log.account} | ${log.sent} | ${log.received} | ${log.status}`,
      datetime: log.datetime || "-",
      model: log.model || "-",
      provider: log.provider || "-",
      account: log.account || "-",
      sent: log.sent || "-",
      received: log.received || "-",
      status: log.status || "-",
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLog(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h2 className="text-xl font-semibold">Request Logs</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-text-muted flex items-center gap-2 cursor-pointer">
            <span>Auto Refresh (3s)</span>
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${autoRefresh ? "bg-primary" : "bg-bg-subtle border border-border"
                }`}
              role="switch"
              aria-checked={autoRefresh}
              aria-label="Auto refresh logs"
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-1"
                  }`}
              />
            </button>
          </label>
          <Button variant="ghost" size="sm" onClick={() => fetchLogs(true)} aria-label="Refresh logs">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
            Refresh
          </Button>
        </div>
      </div>

      {fetchError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">error</span>
            <span className="truncate">{fetchError}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchLogs(true)} className="shrink-0">
            Retry
          </Button>
        </div>
      )}

      <Card className="overflow-hidden bg-surface-2">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs">No logs recorded yet.</div>
        ) : (
          <>
            {/* Mobile Card List (< sm) */}
            <div className="sm:hidden divide-y divide-border/60">
              {logs.map((log, i) => {
                const status = log.status;
                const isPending = status.includes("PENDING");
                const isFailed = status.includes("FAILED") || status.includes("ERROR");
                const isSuccess = status.includes("OK");

                return (
                  <div
                    key={`mob-${i}`}
                    className={`p-3.5 space-y-2.5 transition-colors ${
                      isPending ? "bg-primary/5" : isFailed ? "bg-error/[0.04]" : ""
                    }`}
                  >
                    {/* Status badge, Provider badge, DateTime */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            isSuccess
                              ? "bg-success/10 text-success border-success/30"
                              : isFailed
                              ? "bg-error/10 text-error border-error/30"
                              : "bg-primary/10 text-primary border-primary/30 animate-pulse"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[12px] leading-none">
                            {isSuccess ? "check_circle" : isFailed ? "error" : "hourglass_empty"}
                          </span>
                          {status}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] uppercase font-bold text-text-muted">
                          {log.provider}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted font-mono whitespace-nowrap">
                        {log.datetime}
                      </span>
                    </div>

                    {/* Model */}
                    <div className="font-mono text-xs font-medium text-text-main break-all">
                      {log.model}
                    </div>

                    {/* Footer: Account, In/Out tokens, View/Detail button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                      <div className="flex flex-col text-[11px]">
                        {log.account && log.account !== "-" && (
                          <span className="text-text-muted truncate max-w-[150px]" title={log.account}>
                            {log.account}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-primary">In: {log.sent}</span>
                          <span className="text-text-muted">/</span>
                          <span className="text-success">Out: {log.received}</span>
                        </div>
                      </div>

                      {isFailed ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(log)}
                          aria-label={`View error detail for ${log.model} ${status}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs font-semibold text-error hover:bg-error/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[15px] mr-1" aria-hidden="true">error</span>
                          Detail
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(log)}
                          aria-label={`View detail for ${log.model} ${status}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (sm+) */}
            <div className="hidden sm:block p-0 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs">
              <table className="w-full text-left border-collapse" aria-label="Request logs">
                <thead className="sticky top-0 bg-bg-subtle border-b border-border z-10">
                  <tr>
                    <th scope="col" className="px-3 py-2 border-r border-border whitespace-nowrap">DateTime</th>
                    <th scope="col" className="px-3 py-2 border-r border-border">Model</th>
                    <th scope="col" className="px-3 py-2 border-r border-border whitespace-nowrap">Provider</th>
                    <th scope="col" className="px-3 py-2 border-r border-border">Account</th>
                    <th scope="col" className="px-3 py-2 border-r border-border text-right whitespace-nowrap">In</th>
                    <th scope="col" className="px-3 py-2 border-r border-border text-right whitespace-nowrap">Out</th>
                    <th scope="col" className="px-3 py-2 border-r border-border whitespace-nowrap">Status</th>
                    <th scope="col" className="px-3 py-2 text-center whitespace-nowrap">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {logs.map((log, i) => {
                    const status = log.status;
                    const isPending = status.includes("PENDING");
                    const isFailed = status.includes("FAILED") || status.includes("ERROR");
                    const isSuccess = status.includes("OK");

                    return (
                      <tr key={i} className={`hover:bg-primary/5 transition-colors ${isPending ? 'bg-primary/5' : ''} ${isFailed ? 'bg-error/[0.04]' : ''}`}>
                        <td className="px-3 py-1.5 border-r border-border text-text-muted whitespace-nowrap">{log.datetime}</td>
                        <td className="px-3 py-1.5 border-r border-border font-medium break-all max-w-[220px]">{log.model}</td>
                        <td className="px-3 py-1.5 border-r border-border whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] uppercase font-bold">
                            {log.provider}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 border-r border-border truncate max-w-[150px]" title={log.account}>{log.account}</td>
                        <td className="px-3 py-1.5 border-r border-border text-right text-primary whitespace-nowrap">{log.sent}</td>
                        <td className="px-3 py-1.5 border-r border-border text-right text-success whitespace-nowrap">{log.received}</td>
                        <td className={`px-3 py-1.5 border-r border-border font-bold whitespace-nowrap ${isSuccess ? 'text-success' :
                            isFailed ? 'text-error' :
                              'text-primary animate-pulse'
                          }`}>
                          {status}
                        </td>
                        <td className="px-3 py-1.5 text-center whitespace-nowrap">
                          {isFailed ? (
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(log)}
                              aria-label={`View error detail for ${log.model} ${status}`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-error/30 bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">error</span>
                              Detail
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(log)}
                              aria-label={`View detail for ${log.model} ${status}`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      <div className="text-[10px] text-text-muted italic">
        Logs are loaded from the request history database.
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedLog?.status?.includes("FAILED") || selectedLog?.status?.includes("ERROR") ? "Request Error Detail" : "Request Log Detail"}
        size="lg"
      >
        {selectedLog && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-lg border px-4 py-3 text-sm font-medium flex items-center gap-2 ${selectedLog.status.includes("FAILED") || selectedLog.status.includes("ERROR")
                ? "border-error/30 bg-error/10 text-error"
                : selectedLog.status.includes("OK")
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {selectedLog.status.includes("FAILED") || selectedLog.status.includes("ERROR") ? "error" : selectedLog.status.includes("OK") ? "check_circle" : "hourglass_empty"}
              </span>
              {selectedLog.status}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">DateTime</span>
                <span className="font-mono text-text-main">{selectedLog.datetime}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Provider</span>
                <span className="font-mono text-text-main">{selectedLog.provider}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Model</span>
                <span className="font-mono font-medium text-text-main break-all">{selectedLog.model}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Account</span>
                <span className="font-mono text-text-main truncate" title={selectedLog.account}>{selectedLog.account}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Input Tokens</span>
                <span className="font-mono text-primary">{selectedLog.sent}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Output Tokens</span>
                <span className="font-mono text-success">{selectedLog.received}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Raw Log</span>
              <pre className="rounded-lg border border-border bg-bg-subtle p-3 text-xs font-mono text-text-main whitespace-pre-wrap break-all overflow-x-auto">
                {selectedLog.raw}
              </pre>
            </div>

            {(selectedLog.status.includes("FAILED") || selectedLog.status.includes("ERROR")) && (
              <p className="text-xs text-text-muted">
                Tip: Check <span className="font-mono">/dashboard/providers</span> for provider health and retry the request. Use the log timestamp to correlate with server console.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
