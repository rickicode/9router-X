"use client";

import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";

export default function RequestErrorModal({ selectedError, fetchedError, loading, onClose }) {
  return (
    <Modal
      isOpen={Boolean(selectedError)}
      onClose={onClose}
      title="Request Error Details"
      size="lg"
    >
      {selectedError && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-2/60 border border-border rounded-xl p-3">
            <div>
              <span className="text-text-muted">Status:</span>{" "}
              <span className="font-mono font-bold text-danger">
                {selectedError.status || "error"}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Timestamp:</span>{" "}
              <span className="text-text-main">
                {selectedError.timestamp ? new Date(selectedError.timestamp).toLocaleString("en-US") : "Unknown"}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Model:</span>{" "}
              <span className="font-mono font-bold text-text-main truncate block" title={selectedError.model}>
                {selectedError.model}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Provider:</span>{" "}
              <Badge variant="neutral" size="sm">
                {selectedError.provider || "unknown"}
              </Badge>
            </div>
            <div>
              <span className="text-text-muted">Account:</span>{" "}
              <span className="font-mono text-text-main truncate block font-medium" title={selectedError.account || selectedError.connectionId || "Direct"}>
                {selectedError.account || selectedError.connectionId || "Direct"}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Format:</span>{" "}
              <span className="font-semibold text-text-main">
                {selectedError.isStream ? "STREAM (SSE)" : "JSON"}
              </span>
            </div>
            <div>
              <span className="text-text-muted">API Key:</span>{" "}
              <span className="font-mono text-text-main truncate block" title={selectedError.rawApiKey || selectedError.apiKey}>
                {selectedError.apiKey || "Default Key"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[16px]">error</span>
                Error Response Payload
              </span>
              {(selectedError.error || fetchedError) && (
                <button
                  type="button"
                  onClick={() => {
                    const err = selectedError.error || fetchedError;
                    const text = typeof err === "object"
                      ? JSON.stringify(err, null, 2)
                      : String(err);
                    navigator.clipboard?.writeText(text);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[13px]">content_copy</span>
                  Copy
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-6 border border-border/40 rounded-xl bg-surface-2/40 text-text-muted text-xs gap-2">
                <span className="material-symbols-outlined animate-spin !text-[18px]">progress_activity</span>
                Loading error trace...
              </div>
            ) : (
              <pre className="max-h-[300px] overflow-auto rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 p-3.5 font-mono text-xs text-rose-600 dark:text-rose-300 whitespace-pre-wrap break-words">
                {(selectedError.error || fetchedError)
                  ? (typeof (selectedError.error || fetchedError) === "object"
                      ? JSON.stringify(selectedError.error || fetchedError, null, 2)
                      : (selectedError.error || fetchedError))
                  : `[${selectedError.status || "FAILED"}]: Request failed with HTTP status ${selectedError.status}. Check Request Details tab for archived traces.`}
              </pre>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <a
              href="/dashboard/usage?tab=details"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              <span className="material-symbols-outlined !text-[14px]">open_in_new</span>
              View in Request Details Tab
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
