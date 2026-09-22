"use client";

import { Badge, Button } from "@/shared/components";

export default function BenchmarkInspector({ attempt, onClose }) {
  return attempt ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
          <div>
            <div className="flex items-center gap-2.5 font-bold text-text-main text-base">
              <span>{attempt.model}</span>
              <Badge variant={attempt.status === "passed" ? "success" : "error"}>
                {attempt.status?.toUpperCase()}
              </Badge>
              {attempt.http_status ? (
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                    attempt.http_status === 200
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                      : attempt.http_status === 429
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400"
                  }`}
                >
                  HTTP {attempt.http_status}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-text-muted mt-1">
              Suite: <span className="font-semibold uppercase">{attempt.suite}</span> (Rep {attempt.rep || 1}) · Akun:{" "}
              <span className="font-mono">{attempt.account_name || attempt.connection_id || "-"}</span>
              {attempt.format ? ` · Format: ${attempt.format.toUpperCase()}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-xl leading-none">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs font-mono bg-white dark:bg-[#202020]">
          {/* Telemetry Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
              <div className="text-text-muted text-[10px]">Skor Kualitas</div>
              <div className="text-sm font-bold text-text-main">{attempt.score ?? "-"} / 100</div>
            </div>
            <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
              <div className="text-text-muted text-[10px]">TTFT (Byte Pertama)</div>
              <div className="text-sm font-bold text-text-main">
                {attempt.ttft_ms ? `${attempt.ttft_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
              <div className="text-text-muted text-[10px]">Total Waktu</div>
              <div className="text-sm font-bold text-text-main">
                {attempt.total_ms ? `${attempt.total_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
              <div className="text-text-muted text-[10px]">Throughput (tok/s)</div>
              <div className="text-sm font-bold text-text-main">
                {attempt.tps ?? "-"} tok/s
              </div>
            </div>
          </div>

          {/* Error Box if any */}
          {attempt.error ? (
            <div>
              <div className="text-rose-500 dark:text-rose-400 font-bold mb-1 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>Pesan Error / Upstream Diagnostic:</span>
              </div>
              <pre className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-rose-600 dark:text-rose-300 whitespace-pre-wrap break-all text-[11px]">
                {attempt.error}
              </pre>
            </div>
          ) : null}

          {/* Request Payload */}
          <div>
            <div className="text-text-muted font-bold mb-1 flex items-center justify-between">
              <span>Request Payload:</span>
              <button
                onClick={() => navigator.clipboard.writeText(attempt.request_body || "")}
                className="text-brand-500 hover:underline text-[10px]"
              >
                Salin Request
              </button>
            </div>
            <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-3 text-text-main whitespace-pre-wrap break-all text-[11px] max-h-48 overflow-y-auto">
              {attempt.request_body || "Tidak ada body request tersimpan."}
            </pre>
          </div>

          {/* Response Body */}
          <div>
            <div className="text-text-muted font-bold mb-1 flex items-center justify-between">
              <span>Upstream Response Body:</span>
              <button
                onClick={() => navigator.clipboard.writeText(attempt.response_body || attempt.excerpt || "")}
                className="text-brand-500 hover:underline text-[10px]"
              >
                Salin Respon
              </button>
            </div>
            <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-3 text-text-main whitespace-pre-wrap break-all text-[11px] max-h-60 overflow-y-auto">
              {attempt.response_body || attempt.excerpt || "Tidak ada respon body tersimpan."}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
          <span className="text-[11px] text-text-muted">
            Waktu eksekusi: {new Date(attempt.created_at).toLocaleString()}
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  ) : null;
}