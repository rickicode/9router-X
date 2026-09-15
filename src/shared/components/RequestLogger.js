"use client";

import { useState, useEffect } from "react";
import Card from "./Card";
import Button from "./Button";
import Modal from "./Modal";

export default function RequestLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs(false);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchLogs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/usage/request-logs");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Failed to load logs (${res.status})`);
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      setFetchError(error.message || "Failed to fetch logs");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleOpenDetail = (rawLog) => {
    const parts = rawLog.split(" | ");
    setSelectedLog({
      raw: rawLog,
      datetime: parts[0] || "-",
      model: parts[1] || "-",
      provider: parts[2] || "-",
      account: parts[3] || "-",
      sent: parts[4] || "-",
      received: parts[5] || "-",
      status: parts[6] || "-",
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLog(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Request Logs</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text-muted flex items-center gap-2 cursor-pointer">
            <span>Auto Refresh (3s)</span>
            <div
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${autoRefresh ? "bg-primary" : "bg-bg-subtle border border-border"
                }`}
              role="switch"
              aria-checked={autoRefresh}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setAutoRefresh(!autoRefresh);
                }
              }}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-1"
                  }`}
              />
            </div>
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
          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
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

      <Card className="overflow-hidden bg-black/5 dark:bg-black/20">
        <div className="p-0 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No logs recorded yet.</div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap" aria-label="Request logs">
              <thead className="sticky top-0 bg-bg-subtle border-b border-border z-10">
                <tr>
                  <th scope="col" className="px-3 py-2 border-r border-border">DateTime</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">Model</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">Provider</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">Account</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">In</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">Out</th>
                  <th scope="col" className="px-3 py-2 border-r border-border">Status</th>
                  <th scope="col" className="px-3 py-2 text-center">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {logs.map((log, i) => {
                  const parts = log.split(" | ");
                  if (parts.length < 7) return null;

                  const status = parts[6];
                  const isPending = status.includes("PENDING");
                  const isFailed = status.includes("FAILED") || status.includes("ERROR");
                  const isSuccess = status.includes("OK");

                  return (
                    <tr key={i} className={`hover:bg-primary/5 transition-colors ${isPending ? 'bg-primary/5' : ''} ${isFailed ? 'bg-red-500/[0.04]' : ''}`}>
                      <td className="px-3 py-1.5 border-r border-border text-text-muted">{parts[0]}</td>
                      <td className="px-3 py-1.5 border-r border-border font-medium">{parts[1]}</td>
                      <td className="px-3 py-1.5 border-r border-border">
                        <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] uppercase font-bold">
                          {parts[2]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-r border-border truncate max-w-[150px]" title={parts[3]}>{parts[3]}</td>
                      <td className="px-3 py-1.5 border-r border-border text-right text-primary">{parts[4]}</td>
                      <td className="px-3 py-1.5 border-r border-border text-right text-success">{parts[5]}</td>
                      <td className={`px-3 py-1.5 border-r border-border font-bold ${isSuccess ? 'text-success' :
                          isFailed ? 'text-error' :
                            'text-primary animate-pulse'
                        }`}>
                        {status}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {isFailed ? (
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(log)}
                            aria-label={`View error detail for ${parts[1]} ${status}`}
                            className="inline-flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 dark:text-red-400 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">error</span>
                            Detail
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(log)}
                            aria-label={`View detail for ${parts[1]} ${status}`}
                            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
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
          )}
        </div>
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
                ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                : selectedLog.status.includes("OK")
                  ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
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
