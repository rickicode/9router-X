"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function BenchmarkInspector({ attempt, onClose }) {
  const { copied, copy } = useCopyToClipboard();

  // ESC key listener
  useEffect(() => {
    if (!attempt) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [attempt, onClose]);

  if (!attempt) return null;

  const getBadgeVariant = (status) => {
    switch (status) {
      case "passed":
        return "success";
      case "rate_limited":
        return "warning";
      case "cancelled":
      case "skipped":
        return "default";
      default:
        return "error";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-sm border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-3">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2.5 font-bold text-text-main text-base flex-wrap">
              <span id="inspector-modal-title" className="truncate">{attempt.model}</span>
              <Badge variant={getBadgeVariant(attempt.status)}>
                {attempt.status?.toUpperCase()}
              </Badge>
              {attempt.http_status ? (
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                    attempt.http_status === 200
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : attempt.http_status === 429
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  HTTP {attempt.http_status}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-text-muted mt-1 font-mono truncate">
              Suite: <span className="font-semibold uppercase text-text-main">{attempt.suite}</span> (Rep {attempt.rep || 1}) · Account:{" "}
              <span>{attempt.account_name || attempt.connection_id || "-"}</span>
              {attempt.format ? ` · Format: ${attempt.format.toUpperCase()}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-11 sm:size-8 shrink-0 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors"
            aria-label="Close attempt inspector"
          >
            <span className="material-symbols-outlined text-xl leading-none">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs font-mono bg-surface custom-scrollbar">
          {/* Telemetry Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Quality Score</div>
              <div className="text-sm font-bold text-text-main mt-0.5">{attempt.score ?? "-"} / 100</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">TTFT (First Byte)</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.ttft_ms ? `${attempt.ttft_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Total Latency</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.total_ms ? `${attempt.total_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Speed</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.tps ? `${attempt.tps} tok/s` : "-"}
              </div>
            </div>
          </div>

          {/* Error Box if any */}
          {attempt.error ? (
            <div>
              <div className="text-rose-400 font-bold mb-1.5 flex items-center gap-1.5 font-sans">
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>Error Message / Upstream Diagnostics:</span>
              </div>
              <pre className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-rose-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed select-all">
                {attempt.error}
              </pre>
            </div>
          ) : null}

          {/* Request Payload */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-sans">
              <span className="text-text-muted font-bold text-xs">Request Payload (Prompt):</span>
              {attempt.request_body ? (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={copied === "req_body" ? "check" : "content_copy"}
                  onClick={() => copy(attempt.request_body, "req_body")}
                >
                  {copied === "req_body" ? "Copied!" : "Copy Payload"}
                </Button>
              ) : null}
            </div>
            <pre className="rounded-lg border border-border bg-surface-3 p-3 text-text-main text-[11px] whitespace-pre-wrap break-all max-h-52 overflow-y-auto leading-relaxed select-all custom-scrollbar">
              {attempt.request_body || "No request body captured"}
            </pre>
          </div>

          {/* Model Response */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-sans">
              <span className="text-text-muted font-bold text-xs">Model Response Output:</span>
              {attempt.response_body || attempt.excerpt ? (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={copied === "resp_body" ? "check" : "content_copy"}
                  onClick={() => copy(attempt.response_body || attempt.excerpt, "resp_body")}
                >
                  {copied === "resp_body" ? "Copied!" : "Copy Output"}
                </Button>
              ) : null}
            </div>
            <pre className="rounded-lg border border-border bg-surface-3 p-3 text-emerald-400 text-[11px] whitespace-pre-wrap break-all max-h-72 overflow-y-auto leading-relaxed select-all custom-scrollbar">
              {attempt.response_body || attempt.excerpt || "No response body captured"}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-border px-6 py-3.5 bg-surface-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
